import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/* LA FENETRE DE PAIEMENT REFERMEE, EPROUVEE (23 novembre 2026).

   « Quand on choisit un mode de paiement, exemple carte, on ne peut plus
   revenir en arriere et modifier. C est toujours paiement en cours. Ensuite
   quand on choisit Moov et Celtiis rien ne se passe, ca ne demande pas de
   recuperer un numero de telephone » (Yeman, pendant l essai du Sceau).

   Deux moities :
   · le VRAI module `shared/kkiapay-widget.ts`, joue sur un faux navigateur
     qui porte le meme contrat que le script de KkiaPay (ses ecouteurs, sa
     fermeture) : refermer rend la main a qui le demande, pas aux autres ;
   · le texte des deux pages (« Regler », le devis) : le moyen choisi ouvre
     sa fenetre, Moov et Celtiis demandent le numero, une sortie reste.

   Rien n est ecrit sur le disque : `--prouve` casse chaque regle EN MEMOIRE. */

const racine = path.resolve(import.meta.dirname, '..');
const lis = (f) => readFileSync(path.join(racine, f), 'utf8');
const sources = {
  widget: lis('src/shared/kkiapay-widget.ts'),
  regler: lis('src/apps/regler/App.tsx'),
  devis: lis('src/apps/devis/App.tsx'),
  couronne: lis('src/apps/couronne/Booking.tsx'),
};

/* ── Le faux navigateur : ce que le script de KkiaPay pose sur la fenetre. ── */
let numero = 0;
async function charge(ts) {
  const { code } = await transform(ts, {
    loader: 'ts', format: 'esm',
    define: { 'import.meta.env': JSON.stringify({ VITE_KKIAPAY_PUBLIC_KEY: 'pk_essai', VITE_KKIAPAY_SANDBOX: 'false' }) },
  });
  const w = { ouvertures: [], fermetures: 0, sdk: {} };
  const poseLeScript = () => {
    w.openKkiapayWidget = (o) => { w.ouvertures.push(o); };
    w.closeKkiapayWidget = () => { w.fermetures += 1; };
    w.addSuccessListener = (cb) => { w.sdk.succes = cb; };
    w.addFailedListener = (cb) => { w.sdk.echec = cb; };
    w.addKkiapayCloseListener = (cb) => { w.sdk.ferme = cb; };
  };
  globalThis.window = w;
  globalThis.document = {
    createElement: () => ({}),
    head: { appendChild: (el) => { poseLeScript(); queueMicrotask(() => el.onload && el.onload()); } },
  };
  numero += 1;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(`${code}\n// ${numero}`).toString('base64')}`);
  return { mod, w };
}
const attends = (ms) => new Promise((ok) => setTimeout(ok, ms));
const sort = (p) => Promise.race([p.then((v) => ({ etat: 'resolue', v }), (e) => ({ etat: 'rejetee', e })), attends(40).then(() => ({ etat: 'en attente' }))]);
const DEMANDE = { amountXof: 2000, partnerId: 'reg-essai', branchId: 'b1' };

/** Un paiement ouvert, pret a recevoir ce que dirait KkiaPay. */
async function ouvre(ts, plus = {}) {
  const { mod, w } = await charge(ts);
  const p = mod.payWithKkiapay({ ...DEMANDE, ...plus });
  p.catch(() => {});
  await attends(5);
  return { mod, w, p };
}

const sans = (texte, morceau) => texte.split(morceau).join('');
const remplace = (texte, avant, apres) => texte.split(avant).join(apres);

const controles = [
  {
    dit: 'refermer la fenetre rend la main a la page qui le demande, sans panne ni refus',
    ok: async (s) => {
      const { mod, w, p } = await ouvre(s.widget, { rendLaMainALaFermeture: true });
      if (w.ouvertures.length !== 1 || typeof w.sdk.ferme !== 'function') return false;
      w.sdk.ferme();
      const r = await sort(p);
      if (!(r.etat === 'rejetee' && mod.estUneFenetreFermee(r.e) && !mod.estUnePanneDeKkiapay(r.e) && r.e.message === 'Paiement annulé.')) return false;
      /* Et le paiement suivant s'ouvre et aboutit : rien ne reste accroché. */
      const q = mod.payWithKkiapay({ ...DEMANDE, rendLaMainALaFermeture: true });
      q.catch(() => {});
      await attends(5);
      w.sdk.succes('tx-2');
      const r2 = await sort(q);
      return w.ouvertures.length === 2 && r2.etat === 'resolue' && r2.v.transactionId === 'tx-2';
    },
    casse: (s) => ({ ...s, widget: s.widget.replace(/p\.reject\(new FenetreFermee\(PAIEMENT_ANNULE\)\);(\s*\}\);)/, '$1') }),
  },
  {
    dit: 'une page qui ne le demande pas garde son attente d avant (Ma Couronne, le site)',
    ok: async (s) => {
      const { w, p } = await ouvre(s.widget);
      w.sdk.ferme?.();
      return (await sort(p)).etat === 'en attente';
    },
    casse: (s) => ({ ...s, widget: remplace(s.widget, 'if (!p || !p.rendLaMain) return;', 'if (!p) return;') }),
  },
  {
    dit: 'un paiement abouti se resout, et refermer ensuite ne casse rien',
    ok: async (s) => {
      const { w, p } = await ouvre(s.widget, { rendLaMainALaFermeture: true });
      w.sdk.succes({ transactionId: 'tx-1' });
      const r = await sort(p);
      let leve = false;
      try { w.sdk.ferme(); } catch { leve = true; }
      return r.etat === 'resolue' && r.v.transactionId === 'tx-1' && !leve;
    },
    casse: (s) => ({ ...s, widget: remplace(s.widget, "if (id) p.resolve({ transactionId: String(id) });", "if (id) p.reject(new Error('non'));") }),
  },
  {
    dit: 'la carte ouvre la carte, le mobile money ouvre le mobile money avec son numero ecrit',
    ok: async (s) => {
      const a = await ouvre(s.widget, { moyens: ['card'] });
      const b = await ouvre(s.widget, { moyens: ['momo'], phone: '01 97 00 00 00' });
      const c = await ouvre(s.widget);
      const oa = a.w.ouvertures[0], ob = b.w.ouvertures[0], oc = c.w.ouvertures[0];
      return JSON.stringify(oa.paymentMethods) === '["card"]' && JSON.stringify(ob.paymentMethods) === '["momo"]' && ob.phone === '0197000000'
        && !('paymentMethods' in oc) && !('phone' in oc) && oa.amount === 2000 && oa.partnerId === 'reg-essai';
    },
    casse: (s) => ({ ...s, widget: sans(s.widget, '...(req.moyens?.length ? { paymentMethods: [...req.moyens] } : {}),') }),
  },
  {
    dit: '« Changer de moyen » ferme la fenetre et rend la main, meme si elle ne s est jamais montree',
    ok: async (s) => {
      const { mod, w, p } = await ouvre(s.widget);
      mod.abandonneLePaiementKkiapay();
      const r = await sort(p);
      let leve = false;
      try { mod.abandonneLePaiementKkiapay(); } catch { leve = true; }
      return w.fermetures === 2 && r.etat === 'rejetee' && mod.estUneFenetreFermee(r.e) && !leve;
    },
    casse: (s) => ({ ...s, widget: s.widget.replace(/p\?\.reject\(new FenetreFermee\(PAIEMENT_ANNULE\)\);/, '') }),
  },
  {
    dit: 'Regler : la page demande la main a la fermeture, et ne dit rien en rouge quand elle renonce',
    ok: async (s) => /rendLaMainALaFermeture: true,/.test(s.regler)
      && /if \(estUneFenetreFermee\(e\)\) \{ aRenonce\.current = true; relisBientot\(\); return; \}\s*\/\*[^]*?\*\/\s*if \(estUnePanneDeKkiapay\(e\)\)/.test(s.regler),
    casse: (s) => ({ ...s, regler: sans(s.regler, 'if (estUneFenetreFermee(e)) { aRenonce.current = true; relisBientot(); return; }') }),
  },
  {
    dit: 'Regler : pendant le paiement, le lien « Changer de moyen » est la',
    ok: async (s) => /\{ecran\.k === 'paiement' \? \(\s*<p className="rg-centre"><button type="button" className="rg-lien"[^>]*onClick=\{abandonneLePaiementKkiapay\}>Changer de moyen<\/button><\/p>/.test(s.regler),
    casse: (s) => ({ ...s, regler: remplace(s.regler, 'onClick={abandonneLePaiementKkiapay}>Changer de moyen', 'onClick={() => {}}>Changer de moyen') }),
  },
  {
    dit: 'Regler : Moov et Celtiis demandent son numero, et le sceau l attend',
    ok: async (s) => /const parMobile = moyen === 'moov' \|\| moyen === 'celtiis';/.test(s.regler)
      && /<input id="rg-numero-kkiapay" inputMode="tel"/.test(s.regler)
      && /<span className="rg-doux">Votre numéro \{nomDuMoyen\}<\/span>/.test(s.regler)
      && /disabled=\{ecran\.k === 'paiement' \|\| mtnOccupe \|\| \(parMobile && !p\.sansPiece && !p\.tetes && !numeroLu\)\}/.test(s.regler)
      && /`Votre numéro \$\{nomDuMoyen\} d’abord`/.test(s.regler),
    casse: (s) => ({ ...s, regler: remplace(s.regler, " || (parMobile && !p.sansPiece && !p.tetes && !numeroLu)}", '}') }),
  },
  {
    dit: 'Regler : le numero lu part dans la fenetre, la carte ouvre la carte, le foyer garde tout',
    ok: async (s) => /const surSaNote = !p\.sansPiece && !p\.tetes;/.test(s.regler)
      && /const numero = surSaNote && parMobile \? msisdnDe\(numeroKkia\) : null;/.test(s.regler)
      && /surSaNote && moyen === 'carte' \? \{ moyens: \['card'\] as const \} : surSaNote && parMobile \? \{ moyens: \['momo'\] as const \} : \{\}/.test(s.regler)
      && /\.\.\.\(numero \? \{ phone: numero\.slice\(3\) \} : \{\}\),/.test(s.regler),
    casse: (s) => ({ ...s, regler: remplace(s.regler, '...(numero ? { phone: numero.slice(3) } : {}),', '') }),
  },
  {
    dit: 'Regler : apres un renoncement, la note se relit avant de rouvrir un paiement',
    ok: async (s) => /if \(aRenonce\.current\) \{\s*const r = await lisLeLien\(jeton\);\s*if \(r\.ok && r\.page\?\.etat === 'reglee'\) \{ setEcran\(\{ k: 'reglee', page: \{ \.\.\.r\.page, resteXof: 0 \} \}\); return; \}/.test(s.regler)
      && /const relisBientot = \(\) => \{/.test(s.regler),
    casse: (s) => ({ ...s, regler: remplace(s.regler, 'if (aRenonce.current) {', 'if (false) {') }),
  },
  {
    dit: 'Regler : les moyens restent figes pendant un paiement (deux moyens en vol, deux fois l argent)',
    ok: async (s) => /disabled=\{mtnOccupe \|\| ecran\.k === 'paiement'\} onClick=\{\(\) => setMoyen\(m\.k\)\}/.test(s.regler),
    casse: (s) => ({ ...s, regler: remplace(s.regler, "disabled={mtnOccupe || ecran.k === 'paiement'} onClick={() => setMoyen(m.k)}", 'onClick={() => setMoyen(m.k)}') }),
  },
  {
    dit: 'Devis : l acompte rend la main a la fermeture, sans rouge, et offre « Changer de moyen »',
    ok: async (s) => /rendLaMainALaFermeture: true,\s*moyens: moyen === 'carte' \? \['card'\] : \['momo'\],/.test(s.devis)
      && /if \(!estUneFenetreFermee\(e\)\) setErreur\(/.test(s.devis)
      && /\{enPaiement \? \(\s*<p className="dv-centre"><button type="button" className="dv-lien" onClick=\{abandonneLePaiementKkiapay\}>Changer de moyen<\/button><\/p>/.test(s.devis)
      && /finally \{\s*setEnPaiement\(false\);\s*setOccupe\(false\);/.test(s.devis),
    casse: (s) => ({ ...s, devis: remplace(s.devis, 'if (!estUneFenetreFermee(e)) setErreur(', 'setErreur(') }),
  },
  {
    dit: 'les autres pages ne sont pas touchees : Ma Couronne ne demande pas la main',
    ok: async (s) => /payWithKkiapay\(/.test(s.couronne) && !/rendLaMainALaFermeture/.test(s.couronne),
    casse: (s) => ({ ...s, couronne: `${s.couronne}\n// rendLaMainALaFermeture` }),
  },
];

const prouve = process.argv.includes('--prouve');
let fautes = 0;
if (!prouve) {
  for (const c of controles) {
    let bon = false;
    try { bon = await c.ok(sources); } catch (e) { console.log(`        (${e instanceof Error ? e.message : e})`); }
    if (!bon) fautes += 1;
    console.log(`${bon ? '  ok   ' : '  FAUTE '}${c.dit}`);
  }
  console.log(fautes ? `\n${fautes} FAUTE(S) sur ${controles.length}` : `\n${controles.length} controles, tout est vert`);
} else {
  for (const c of controles) {
    const casse = c.casse(sources);
    const change = Object.keys(sources).some((k) => casse[k] !== sources[k]);
    let tient = true;
    try { tient = await c.ok(casse); } catch { tient = false; }
    const vue = change && !tient;
    if (!vue) fautes += 1;
    console.log(`${vue ? '  vue   ' : change ? '  MUETTE ' : '  SANS EFFET '}${c.dit}`);
  }
  console.log(fautes ? `\n${fautes} panne(s) non vue(s) sur ${controles.length}` : `\n--prouve ${controles.length}/${controles.length} : chaque panne est vue`);
}
process.exit(fautes ? 1 : 0);
