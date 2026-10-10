import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LA REVUE DU 10 OCTOBRE 2026, LOT « VENTE-BIS », EPROUVEE —
   `node scripts/verifie-revue-vente-bis.mjs`

   Le banc (`verifie-revue-vente-bis.harnais.ts`) tourne dans un PROCESSUS
   FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   d'autres equipes y ecrivent en meme temps. Elle est servie a esbuild au
   chargement du fichier, et au banc quand il lit une source ; l'empreinte
   md5 de chaque fichier est comparee avant et apres, dans un `finally`, pour
   prouver que rien n'a bouge. Une faute dont le texte ne se trouve plus
   (exactement une fois) fait echouer la preuve : elle ne prouverait rien.

   LE CONTROLE RECALE DU CARNET. `verifie-le-carnet-dit-la-fenetre` lit dans
   actions.tsx que l'encaissement fige le prix ; depuis le 10 octobre 2026 il
   le fait par `prixFigeAuReglement`. La preuve rejoue aussi CE banc-la, avec
   le gel retire, vide, ou rendu a sa forme d'avant, servis a sa lecture de
   la source (actions.tsx n'est jamais ecrit) : il doit crier chaque fois. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const P = 'src/apps/trone/routes/vente/encaissement-pur.ts';
const C = 'src/apps/trone/routes/vente/Caisse.tsx';
const F = 'src/apps/trone/routes/vente/Factures.tsx';
const L = 'src/apps/trone/routes/finances/lettres-du-pret.ts';
const R = 'src/apps/trone/routes/finances/Prets.tsx';

const FAUTES = [
  /* #50 : le code s'empile sur la remise deja posee. */
  { n: 50, fichier: P, avant: 'const pctEff = cumul.codeConsomme ? 0 : pct;', apres: 'const pctEff = pct;' },
  { n: 50, fichier: P, avant: 'const xofEff = cumul.codeConsomme ? 0 : xof;', apres: 'const xofEff = xof;' },
  { n: 50, fichier: C, avant: 'globalDiscountPct: ticket.remisePct,', apres: 'globalDiscountPct: globalDisc,' },
  /* #51 : le rituel repris sans sa remise ni son acompte. */
  { n: 51, fichier: P, avant: 'const acompteXof = Math.min(f(e.dejaRecuXof), partNetteXof, netXof);', apres: 'const acompteXof = 0;' },
  { n: 51, fichier: P, avant: 'const rdv = Math.min(f(e.remiseDuRendezVousXof), Math.round(prest));', apres: 'const rdv = 0;' },
  { n: 51, fichier: C, avant: 'remiseDuRendezVousXof: rituelChoisi ? Math.max(0, apptTotalXof(rituelChoisi, svcById) - apptNetXof(rituelChoisi, svcById)) : 0,', apres: 'remiseDuRendezVousXof: 0,' },
  { n: 51, fichier: C, avant: 'apptDueXof({ ...a, ...fige }, svcById) + acompteImpute,', apres: 'apptDueXof({ ...a, ...fige }, svcById),' },
  /* #52 : changer de cliente garde le rituel et le soin de la precedente. */
  { n: 52, fichier: C, avant: 'onChange={(v) => { changeDeCliente(v);', apres: 'onChange={(v) => { setClientId(v);' },
  { n: 52, fichier: C, avant: "      choisirRituel('');\n      retireLeSoin();\n", apres: '' },
  /* #53 : l'avoir passe pour des billets. */
  { n: 53, fichier: P, avant: "amountXof: f(v.avoirXof), method: 'Avoir',", apres: 'amountXof: f(v.avoirXof), method: v.moyen, cashbox: v.caisse,' },
  { n: 53, fichier: C, avant: 'const inv: Invoice = versements.length > 0 ? { ...piece, payments: versements } : piece;', apres: 'const inv: Invoice = piece;' },
  /* #55 : « Marquer payee » au jour de la facture, sans caisse, sans le reste. */
  { n: 55, fichier: P, avant: 'id: v.id, date: v.jour, amountXof: reste,', apres: 'id: v.id, date: inv.date, amountXof: reste,' },
  { n: 55, fichier: P, avant: 'const reste = invoiceResteXof(inv);', apres: 'const reste = invoiceResteXof({ ...inv, payments: [] });' },
  { n: 55, fichier: F, avant: "useEffect(() => { setPayCaisse(''); }, [selectedId]);", apres: '' },
  { n: 55, fichier: F, avant: 'disabled={caisseManquante(payCaisse, boxesBranche.length)}', apres: '' },
  /* #56 : les dates de la payeuse sans l'annee. */
  { n: 56, fichier: F, avant: '${frShortAn(i.date)}', apres: '${frDay(i.date)}' },
  { n: 56, fichier: F, avant: '${frShortAn(jourDuPassage(i))}', apres: '${frDay(jourDuPassage(i))}' },
  /* #47 : signer a l'ecran un formulaire non enregistre, perdre la signature. */
  { n: 47, fichier: L, avant: 'return memesTermes(enregistre, formulaire);', apres: 'return true;' },
  { n: 47, fichier: L, avant: 'if (!enregistre || plan.trop) return false;', apres: 'if (!enregistre) return false;' },
  { n: 47, fichier: R, avant: 'aSigner={signableALEcran ? {', apres: 'aSigner={baseDuMembre > 0 && montantsPret.xof > 0 && planSalaire.mens > 0 ? {' },
  { n: 47, fichier: R, avant: 'const signee = { ...s, at: todayISO() };', apres: 'const signee = s;' },
  { n: 47, fichier: R, avant: 'if (signee) ligne.signatureDesLettres = signee;', apres: '' },

  /* ── REPRISE DU 10 OCTOBRE 2026, apres relecture ──
     Le cablage de l'argent encaisse a la Caisse : les six pannes que la
     relecture a remises sans que le banc crie, et leurs voisines. */
  { n: 51, fichier: C, avant: 'const posCashDue = Math.max(0, aPayerXof - posAvoir);', apres: 'const posCashDue = Math.max(0, netXof - posAvoir);' },
  { n: 51, fichier: C, avant: 'paidXof: (a.paidXof ?? 0) + recu.comptantXof + recu.avoirXof,', apres: 'paidXof: (a.paidXof ?? 0) + partNette,' },
  { n: 51, fichier: C, avant: '      acompteXof: ticket.acompteXof,\n', apres: '' },
  { n: 51, fichier: C, avant: 'depositCreditXof: ticket.acompteXof > 0 ? ticket.acompteXof : undefined,', apres: '' },
  { n: 51, fichier: C, avant: 'const acompteImpute = ticket.acompteXof;', apres: 'const acompteImpute = 0;' },
  { n: 53, fichier: C, avant: '      avoirXof: posAvoir,\n      acompteXof', apres: '      avoirXof: 0,\n      acompteXof' },
  { n: 53, fichier: C, avant: '      comptantXof: posCashDue,\n', apres: '      comptantXof: aPayerXof,\n' },
  { n: 53, fichier: C, avant: 'avoirXof: posAvoir > 0 ? posAvoir : undefined,', apres: '' },
  { n: 53, fichier: C, avant: 'acompteXof: acompteImpute, avoirXof: posAvoir });', apres: 'acompteXof: acompteImpute, avoirXof: 0 });' },
  { n: 53, fichier: C, avant: 'Math.min(Math.min(posAvoirBal, aPayerXof), Math.round(Number(avoirStr) || 0))', apres: 'Math.min(posAvoirBal, Math.round(Number(avoirStr) || 0))' },
  { n: 53, fichier: C, avant: "kind: 'usage', amountXof: posAvoir,", apres: "kind: 'usage', amountXof: aPayerXof," },
  /* #51 : l'argent deja recu change de jour, ou vient d'une autre piece. */
  { n: 51, fichier: P, avant: "date: (p.date || jourDeLaVente).slice(0, 10), amountXof: m,", apres: 'date: jourDeLaVente, amountXof: m,' },
  { n: 51, fichier: P, avant: "out.push({ id: v.nouvelId(), date: d.date || v.date, amountXof: m, method: 'Acompte', note: d.note });", apres: "out.push({ id: v.nouvelId(), date: v.acompteDate || v.date, amountXof: m, method: 'Acompte', note: d.note });" },
  { n: 51, fichier: P, avant: '|| (a.payments ?? []).some((p) => p.invoiceId === i.id)', apres: '' },
  { n: 51, fichier: P, avant: "return pieces.some((i) => i.kind === 'facture'", apres: 'return pieces.some((i) => true' },
  { n: 51, fichier: C, avant: ' && !aDejaSaPiece(a, invoices)', apres: '' },
  { n: 51, fichier: C, avant: 'dejaRecu: rituelChoisi ? lArgentDejaRecu(rituelChoisi, dateVente) : undefined,', apres: '' },
  /* #52 : l'avoir tape pour A se pose sur le compte de B. */
  { n: 52, fichier: C, avant: "      retireLeSoin();\n      setAvoirStr('0');\n", apres: '      retireLeSoin();\n' },
  /* #52 : ce que changeDeCliente appelle, vide (la septieme panne de la relecture). */
  { n: 52, fichier: C, avant: 'const retireLeSoin = () => {\n    if (!soinPose) return;', apres: 'const retireLeSoin = () => {\n    return;' },
  { n: 52, fichier: C, avant: '      posesParRituel.current = [];\n    }\n    setApptToSettle(id);', apres: '      posesParRituel.current = [];\n    }\n    if (id) setApptToSettle(id);' },
  /* #56 : la REGLE de la fenetre du foyer, prouvee par deux formateurs sans annee. */
  { n: 56, fichier: F, avant: '{frShortAn(i.date)} · {i.number}', apres: '{frDay(i.date)} · {i.number}' },
  { n: 56, fichier: F, avant: '{frShortAn(i.date)} · {i.number}', apres: '{frShortAn(i.date)} · {i.number} · {frShort(i.date)}' },
  { n: 56, fichier: F, avant: '{frShortAn(i.date)} · {i.number}', apres: "{frShortAn(i.date)} · {i.number} · {new Date(i.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}" },
];

/* Le gel de l'encaissement, retire de la lecture du banc du Carnet. */
const A = 'src/apps/trone/routes/clients/actions.tsx';
const FAUTES_DU_CARNET = [
  { nom: 'le gel n est plus appele', avant: 'const freeze = prixFigeAuReglement(appt, byId, { settleTotal, totalGamme });', apres: 'const freeze = {} as ReturnType<typeof prixFigeAuReglement>;' },
  { nom: 'le gel est vide', avant: 'const prixFige = e.settleTotal > 0 || e.totalGamme > 0 ? prixAFiger(appt, byId) : {};', apres: 'const prixFige = {} as { priceXof?: number };' },
  { nom: 'le gel d avant le 10 octobre', avant: 'const freeze = prixFigeAuReglement(appt, byId, { settleTotal, totalGamme });', apres: 'const freeze = settleTotal > 0 ? prixAFiger(appt, byId) : {};' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.__horloge = Date.parse('2026-10-10T12:00:00Z');
const __D = Date;
globalThis.Date = class extends __D {
  constructor(...a) { a.length ? super(...a) : super(globalThis.__horloge); }
  static now() { return globalThis.__horloge; }
};
globalThis.__bandeaux = [];
globalThis.document = {
  body: { dataset: {}, appendChild(el) { globalThis.__bandeaux.push(el.textContent); } },
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }),
  querySelectorAll: () => [],
};
const __ecoutes = new Map();
globalThis.window = {
  addEventListener(t, f) { if (!__ecoutes.has(t)) __ecoutes.set(t, []); __ecoutes.get(t).push(f); },
  removeEventListener() {},
  dispatchEvent(e) { for (const f of __ecoutes.get(e.type) ?? []) f(e); return true; },
  location: { href: '', hash: '' }, setTimeout: () => 0,
};
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

/* Le banc du lot, bati avec ou sans une faute, joue dans un fils. */
async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-revue-vente-bis-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-revue-vente-bis.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      plugins: faute ? [{
        name: 'la-faute-remise',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== faute.fichier) return undefined;
            const contents = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').split(faute.avant).join(faute.apres);
            return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) };
          });
        },
      }] : [],
      define: {
        'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }),
        __FAUTE__: JSON.stringify(faute ?? null),
      },
      banner: { js: BANNIERE },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
    return { status: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/* Le banc du Carnet, sa lecture de actions.tsx faussee en memoire : son
   `readFileSync` passe par un module qui sert la faute, et par lui seul. */
async function bancDuCarnet(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-revue-vente-bis-carnet-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  const entree = path.join(racine, 'scripts/verifie-le-carnet-dit-la-fenetre.harnais.ts');
  try {
    await build({
      entryPoints: [entree],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      plugins: [{
        name: 'la-lecture-faussee',
        setup(b) {
          b.onResolve({ filter: /^node:fs$/ }, (args) => (args.importer === entree ? { path: 'fs-fausse', namespace: 'faute' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'faute' }, () => ({
            contents: `import * as fs from 'node:fs';
export const readdirSync = fs.readdirSync;
export function readFileSync(p, e) {
  const s = fs.readFileSync(p, e);
  if (!String(p).split('\\\\').join('/').endsWith(${JSON.stringify(A)})) return s;
  return String(s).replace(/\\r\\n/g, '\\n').split(${JSON.stringify(faute.avant)}).join(${JSON.stringify(faute.apres)});
}`,
            loader: 'js', resolveDir: racine,
          }));
        },
      }],
      define: {
        'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }),
        __PROUVE__: 'false',
      },
      banner: { js: BANNIERE.replace("'2026-10-10T12:00:00Z'", "'2026-10-09T12:00:00Z'") },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
    return { status: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (!prouve) {
  const r = await banc(null);
  process.stdout.write(r.sortie);
  process.exitCode = r.status ?? 1;
} else {
  let tiennent = 0;
  const total = FAUTES.length + FAUTES_DU_CARNET.length;
  for (const f of FAUTES) {
    const texte = readFileSync(path.join(racine, f.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(f.avant).length - 1;
    const avant = md5(f.fichier);
    let verdict;
    try {
      if (fois !== 1) {
        verdict = `LA FAUTE NE SE POSE PLUS (${fois} occurrence(s) du texte)`;
      } else {
        const r = await banc(f);
        const ligne = r.sortie.split(/\r?\n/).find((l) => l.startsWith(`ECHEC #${f.n} `));
        verdict = r.status !== 0 && ligne ? `crie (${ligne.slice(0, 110)})` : `NE CRIE PAS (statut ${r.status})`;
      }
    } finally {
      if (md5(f.fichier) !== avant) verdict = `LE FICHIER A CHANGE PENDANT LA PREUVE (${verdict})`;
    }
    const ok = verdict.startsWith('crie');
    if (ok) tiennent++;
    console.log(`${ok ? 'OK   ' : 'ECHEC'} faute #${f.n} dans ${f.fichier} : ${verdict}`);
  }
  for (const f of FAUTES_DU_CARNET) {
    const texte = readFileSync(path.join(racine, A), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(f.avant).length - 1;
    const avant = md5(A);
    const avantHarnais = md5('scripts/verifie-le-carnet-dit-la-fenetre.harnais.ts');
    let verdict;
    try {
      if (fois !== 1) {
        verdict = `LA FAUTE NE SE POSE PLUS (${fois} occurrence(s) du texte)`;
      } else {
        const r = await bancDuCarnet(f);
        const ligne = r.sortie.split(/\r?\n/).find((l) => l.startsWith('ECHEC actions : honorer fige, encaisser fige'));
        verdict = r.status !== 0 && ligne ? `crie (${ligne.slice(0, 110)})` : `NE CRIE PAS (statut ${r.status})`;
      }
    } finally {
      if (md5(A) !== avant || md5('scripts/verifie-le-carnet-dit-la-fenetre.harnais.ts') !== avantHarnais) {
        verdict = `UN FICHIER A CHANGE PENDANT LA PREUVE (${verdict})`;
      }
    }
    const ok = verdict.startsWith('crie');
    if (ok) tiennent++;
    console.log(`${ok ? 'OK   ' : 'ECHEC'} carnet, ${f.nom} : ${verdict}`);
  }
  console.log(tiennent === total
    ? `\nLa preuve tient : ${tiennent} fautes remises, ${tiennent} cris, aucun fichier du depot touche (md5 identiques).`
    : `\nLA PREUVE NE TIENT PAS : ${total - tiennent} faute(s) sur ${total}.`);
  process.exitCode = tiennent === total ? 0 : 1;
}
