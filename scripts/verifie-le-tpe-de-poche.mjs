import { build, transform } from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BLOCS_DU_TPE, blocDe } from './tpe-copie-serveur.mjs';

/* LE TPE DE POCHE, EPROUVE (25 novembre 2026).

   « Create a terminal of payment for the Trone, a TPE, and I can give the
   access to certain employees to activate it on their phone and collect
   payment from customers » (Yeman). Maquette RsVNQvgB85ZvDVjaKuMrqP, lot 1.

   Trois parties :
     1. la regle (src/shared/tpe-de-poche-pur.ts), rejouee sur des cas ;
     2. la fonction `tpe-de-poche` : ses quatre blocs recopies a l identique,
        sa porte de direction, et AUCUN argent ecrit par elle ;
     3. la table (0246) : lue par la direction seule, ecrite par la fonction
        seule ; et les ecrans (le telephone, le Trone, la page Regler).

   Rien n est ecrit sur le disque : `--prouve` casse chaque regle de texte EN
   MEMOIRE et attend que son controle la voie. */

const racine = path.resolve(import.meta.dirname, '..');
const lis = (f) => readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
const prouve = process.argv.includes('--prouve');
let echecs = 0;
const dit = (nom, ok, detail = '') => {
  if (!ok) echecs++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok || !detail ? '' : `\n       ${detail}`}`);
};
const egal = (nom, attendu, obtenu) => dit(nom, JSON.stringify(attendu) === JSON.stringify(obtenu), `attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`);

/* ── 1. LA REGLE ── */
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-tpe-de-poche-'));
try {
  const sortie = path.join(dossier, 'pur.mjs');
  await build({ entryPoints: [path.join(racine, 'src/shared/tpe-de-poche-pur.ts')], bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', write: true });
  const t = await import(pathToFileURL(sortie).href);
  if (!prouve) {
    egal('le code tape se nettoie (casse, espaces, tiret)', '4k7m9q2x', t.codeDuTpePropre(' 4K7M-9q2x '));
    egal('un code de huit signes de l alphabet est bon ; 0, o, 1, i, l ne le sont pas', [true, false, false, false],
      [t.estUnCodeDuTpe('4k7m9q2x'), t.estUnCodeDuTpe('4k7m9q2o'), t.estUnCodeDuTpe('4k7m9q2'), t.estUnCodeDuTpe(12345678)]);
    egal('le code se dit en deux groupes', '4k7m-9q2x', t.codeDuTpeDit('4k7m9q2x'));
    const tire = t.tireUnCodeDuTpe([0, 1, 30, 31, 62, 4294967295, 7, 8]);
    dit('un code tire est toujours bon', t.estUnCodeDuTpe(tire), tire);
    egal('le jeton d un telephone : 43 signes base64url', [true, false, false],
      [t.estUnJetonDAppareil('A'.repeat(42) + '_'), t.estUnJetonDAppareil('A'.repeat(42)), t.estUnJetonDAppareil('A'.repeat(42) + '=')]);
    egal('le jour de Cotonou : 23 h 30 UTC est deja demain', '2026-11-26', t.jourDuTpe(Date.UTC(2026, 10, 25, 23, 30)));
    egal('... et 22 h 59 UTC encore aujourd hui', '2026-11-25', t.jourDuTpe(Date.UTC(2026, 10, 25, 22, 59)));
    const m = Date.UTC(2026, 10, 25, 10, 0);
    const dans = (min) => new Date(m + min * 60_000).toISOString();
    egal('les etats du TPE', ['sans', 'sans', 'pret', 'code', 'pret', 'actif', 'coupe', 'actif'], [
      t.etatDuTpe(null, m),
      t.etatDuTpe({ autorise: false, appareil_empreinte: 'x' }, m),
      t.etatDuTpe({ autorise: true }, m),
      t.etatDuTpe({ autorise: true, activation_empreinte: 'e', activation_expire_le: dans(5) }, m),
      t.etatDuTpe({ autorise: true, activation_empreinte: 'e', activation_expire_le: dans(-1) }, m),
      t.etatDuTpe({ autorise: true, appareil_empreinte: 'a' }, m),
      t.etatDuTpe({ autorise: true, coupe_le: dans(-3) }, m),
      t.etatDuTpe({ autorise: true, appareil_empreinte: 'a', coupe_le: dans(-3) }, m),
    ]);
    egal('un code ne vaut que pour un membre autorise et avant son heure', [true, false, false],
      [t.codeEncoreBon({ autorise: true, activation_expire_le: dans(1) }, m), t.codeEncoreBon({ autorise: false, activation_expire_le: dans(1) }, m), t.codeEncoreBon({ autorise: true, activation_expire_le: dans(-1) }, m)]);
    const rdvs = [
      { id: 'c', date: '2026-11-25', time: '11:00', status: 'confirmé' },
      { id: 'a', date: '2026-11-25T00:00', time: '09:30', status: 'honoré' },
      { id: 'x', date: '2026-11-25', time: '10:00', status: 'annulé' },
      { id: 'y', date: '2026-11-26', time: '08:30', status: 'confirmé' },
      { id: 'b', date: '2026-11-25', time: '10:00', status: 'en attente' },
    ];
    egal('le jour : ni annule, ni un autre jour, dans l ordre de l heure', ['a', 'b', 'c'], t.rdvsDuJourAuTpe(rdvs, '2026-11-25').map((r) => r.id));
    egal('sans piece : la seance n est pas terminee ; reste nul : reglee ; sinon a encaisser', ['pas-terminee', 'reglee', 'a-encaisser', 'a-encaisser'],
      [t.etatAuTpe(false, null), t.etatAuTpe(true, 0), t.etatAuTpe(true, 15000), t.etatAuTpe(true, null)]);
    egal('le verrou : deux minutes sans toucher, et jamais ouvert sans toucher connu', [false, true, true],
      [t.tpeAVerrouiller(m, m + 119_000), t.tpeAVerrouiller(m, m + 120_000), t.tpeAVerrouiller(0, m)]);
    egal('le code secret : quatre chiffres', [true, false, false], [t.estUnCodeSecretDuTpe('0427'), t.estUnCodeSecretDuTpe('427'), t.estUnCodeSecretDuTpe('04a7')]);
    egal('le nom d un telephone : sans chevron, espaces resserres, soixante signes au plus', ['Android · SM-A155F x', 60],
      [t.nomDAppareil('  Android ·   SM-A155F <x> '), t.nomDAppareil('a'.repeat(90)).length]);
    egal('l adresse d activation : a cote du Trone servi, aucun domaine ecrit', 'https://exemple.test/trone/tpe.html?a=4k7m9q2x', t.adresseDActivation('https://exemple.test', '/trone/', '4k7m9q2x'));
    egal('l adresse de la page Regler en mode TPE', '/trone/payer.html?tg=r-abc&tpe=1', t.adresseDuReglementAuTpe('/trone', 'abc'));

    /* LE LOT 2 (26 novembre 2026) : les plafonds, les especes, le total du soir. */
    egal('les plafonds de la maquette : 300 000 F par paiement, 1 000 000 F par jour', [300000, 1000000], [t.PLAFOND_PAR_PAIEMENT_XOF, t.PLAFOND_PAR_JOUR_XOF]);
    egal('une seance compte une fois, au plus haut ; la seance du jour se met a part', [150000, 100000],
      [t.engageDuJour([{ rdvId: 'a', montantXof: 50000 }, { rdvId: 'a', montantXof: 100000 }, { rdvId: 'b', montantXof: 50000 }]),
        t.engageDuJour([{ rdvId: 'a', montantXof: 100000 }, { rdvId: 'b', montantXof: 50000 }], 'b')]);
    egal('le plafond : 300 000 passe, 300 001 non ; le jour se juge sur ce qui reste', [true, 'plafond-paiement', 'plafond-jour', 50000, true],
      [t.plafondDuTpe(300000, 0).ok, t.plafondDuTpe(300001, 0).raison, t.plafondDuTpe(60000, 950000).raison, t.plafondDuTpe(60000, 950000).resteDuJourXof, t.plafondDuTpe(50000, 950000).ok]);
    egal('des especes declarees : la seance attend, elle ne s encaisse plus', ['especes', 'pas-terminee', 'a-encaisser'],
      [t.etatAuTpe(true, 15000, true), t.etatAuTpe(false, null, true), t.etatAuTpe(true, 15000, false)]);
    egal('la direction ne donne que reçue ou refusee', [true, true, false, false], [t.estUnStatutTraite('recue'), t.estUnStatutTraite('refusee'), t.estUnStatutTraite('a-remettre'), t.estUnStatutTraite('payee')]);
    const ouv = '2026-11-26T09:00:00.000Z';
    const rdvsDuSoir = [
      { id: 'r1', lienDeReglement: { payeLe: '2026-11-26T10:30:00Z', tpe: { membreId: 'brice', nom: 'Brice', le: ouv, montantXof: 30000 } }, payments: [{ amountXof: 5000 }, { amountXof: 30000 }] },
      { id: 'r2', lienDeReglement: { tpe: { membreId: 'brice', nom: 'Brice', le: ouv, montantXof: 20000 } }, payments: [] },
      { id: 'r3', lienDeReglement: { payeLe: '2026-11-26T11:00:00Z', tpe: { membreId: 'awa', nom: 'Awa', le: ouv, montantXof: 40000 } }, payments: [{ amountXof: 40000 }] },
      { id: 'r4', lienDeReglement: { payeLe: '2026-11-26T08:00:00Z', tpe: { membreId: 'brice', nom: 'Brice', le: ouv, montantXof: 9000 } }, payments: [{ amountXof: 9000 }] },
    ];
    const especesDuSoir = [
      { membre_id: 'brice', montant_xof: 12000, declare_le: '2026-11-26T12:00:00Z', statut: 'a-remettre', rdv_id: 'r5' },
      { membre_id: 'brice', montant_xof: 8000, declare_le: '2026-11-26T13:00:00Z', statut: 'recue', rdv_id: 'r6' },
      { membre_id: 'brice', montant_xof: 7000, declare_le: '2026-11-26T14:00:00Z', statut: 'refusee', rdv_id: 'r7' },
      { membre_id: 'brice', montant_xof: 6000, declare_le: '2026-11-25T14:00:00Z', statut: 'a-remettre', rdv_id: 'r8' },
    ];
    egal('le total du soir : le paiement venu apres l ouverture, les especes du jour non refusees', { encaisseXof: 30000, especesXof: 20000, especesARemettreXof: 12000, seances: 3 },
      t.totalDuSoir(rdvsDuSoir, especesDuSoir, 'brice', '2026-11-26'));
    egal('ce que le TPE a engage : ses ouvertures du jour et ses especes du jour non refusees', 30000 + 20000 + 9000 + 12000 + 8000,
      t.engageDuJour([...t.engagementsDesOuvertures(rdvsDuSoir, 'brice', '2026-11-26'), ...t.engagementsDesEspeces(especesDuSoir, 'brice', '2026-11-26')]));
    dit('l identifiant d une declaration porte la seance', /^esp-r5-[0-9a-z]+$/.test(t.idDesEspeces('r5', Date.UTC(2026, 10, 26, 12))));
  }
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

/* ── 2 et 3. LES TEXTES ── */
const FICHIERS = {
  fonction: 'supabase/functions/tpe-de-poche/index.ts',
  migration: 'supabase/migrations/0246_le_tpe_de_poche.sql',
  lot2: 'supabase/migrations/0247_le_tpe_de_poche_lot_2.sql',
  magasin: 'src/shared/tpe-de-poche.ts',
  telephone: 'src/apps/tpe/App.tsx',
  trone: 'src/apps/trone/routes/vente/TpeDePoche.tsx',
  regler: 'src/apps/regler/App.tsx',
  vite: 'vite.config.ts',
  sites: 'scripts/build-sites.mjs',
  pur: 'src/shared/tpe-de-poche-pur.ts',
  entree: 'src/apps/tpe/main.tsx',
  manifeste: 'public/manifest.tpe.webmanifest',
  page: 'tpe.html',
  service: 'public/tpe-sw.js',
  routes: 'src/apps/trone/routes/index.tsx',
  prenoms: 'scripts/verifie-le-prenom-d-usage.harnais.ts',
};
const sources = Object.fromEntries(Object.entries(FICHIERS).map(([k, f]) => [k, existsSync(path.join(racine, f)) ? lis(f) : '']));
const originaux = Object.fromEntries(BLOCS_DU_TPE.map(([nom, src]) => [nom, blocDe(lis(src), nom)]));
const sans = (texte, morceau) => texte.split(morceau).join('');
const remplace = (texte, avant, apres) => texte.split(avant).join(apres);
/** Le texte d'une fonction asynchrone de la fonction Edge, jusqu'à la suivante. */
const corpsDe = (texte, nom) => {
  const d = texte.indexOf(`async function ${nom}(`);
  if (d < 0) return '';
  const k = texte.indexOf('\nasync function ', d + 10);
  const f = texte.indexOf('\nDeno.serve(', d + 10);
  const fin = [k, f].filter((x) => x > 0).sort((a, b) => a - b)[0] ?? texte.length;
  return texte.slice(d, fin);
};

const controles = [
  ...BLOCS_DU_TPE.map(([nom, src]) => ({
    dit: `la fonction porte le bloc ⟨${nom}⟩ de ${src}, caractere pour caractere`,
    ok: (s) => !!originaux[nom] && blocDe(s.fonction, nom) === originaux[nom],
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, originaux[nom]?.slice(40, 90) ?? '@@', 'x') }),
  })),
  {
    dit: 'la fonction dit sa version, et un GET la rend',
    ok: (s) => /const VERSION = '2026-11-\d\d-[a-z]/.test(s.fonction) && /if \(req\.method === 'GET'\) return json\(\{ fonction: 'tpe-de-poche'/.test(s.fonction),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, "fonction: 'tpe-de-poche'", "fonction: 'x'") }),
  },
  {
    dit: 'autoriser, preparer et couper passent par la porte de la direction (est_direction ou la cle de service)',
    ok: (s) => /const qui = await laDirection\(req\);\s*if \(!qui\) return json\(\{ ok: false, raison: 'refusee' \}, 403\);/.test(s.fonction)
      && /rpc\('est_direction'\)/.test(s.fonction)
      && /if \(action === 'autoriser' \|\| action === 'preparer' \|\| action === 'couper'\) \{/.test(s.fonction),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, "if (!qui) return json({ ok: false, raison: 'refusee' }, 403);", '') }),
  },
  {
    dit: 'la cle de service se compare a temps constant',
    ok: (s) => /const memeCle = \(a: string, b: string\): boolean => \{/.test(s.fonction) && /cles\.some\(\(c\) => memeCle\(bearer, c\)\)/.test(s.fonction),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, 'cles.some((c) => memeCle(bearer, c))', 'cles.includes(bearer)') }),
  },
  {
    dit: 'aucun code ni jeton n est garde en clair : leur empreinte seulement',
    ok: (s) => /activation_empreinte: await empreinte\(code\)/.test(corpsDe(s.fonction, 'preparer'))
      && /appareil_empreinte: await empreinte\(jeton\)/.test(corpsDe(s.fonction, 'activer'))
      && /eq\('appareil_empreinte', await empreinte\(String\(jeton\)\)\)/.test(s.fonction),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, 'appareil_empreinte: await empreinte(jeton)', 'appareil_empreinte: jeton') }),
  },
  {
    dit: 'un code inconnu et un code passe recoivent la meme reponse, et un code ne sert qu une fois',
    ok: (s) => /if \(!ligne \|\| !codeEncoreBon\(ligne, Date\.now\(\)\)\) return json\(\{ ok: false, raison: 'code' \}\);/.test(s.fonction)
      && /activation_empreinte: null, activation_expire_le: null, derniere_vue_le: maintenant/.test(corpsDe(s.fonction, 'activer'))
      && /\.eq\('activation_empreinte', ligne\.activation_empreinte \?\? ''\)/.test(corpsDe(s.fonction, 'activer')),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, ".eq('activation_empreinte', ligne.activation_empreinte ?? '')", '') }),
  },
  {
    dit: 'un TPE coupe ou plus autorise ne voit plus rien',
    ok: (s) => /return l && l\.autorise \? l : null;/.test(s.fonction)
      && /const tpe = await leTpeDuJeton\(b\.jeton\);\s*if \(!tpe\) return json\(\{ ok: false, raison: 'coupe' \}, 401\);/.test(corpsDe(s.fonction, 'jour'))
      && /const tpe = await leTpeDuJeton\(b\.jeton\);\s*if \(!tpe\) return json\(\{ ok: false, raison: 'coupe' \}, 401\);/.test(corpsDe(s.fonction, 'ouvrir')),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, 'return l && l.autorise ? l : null;', 'return l;') }),
  },
  {
    dit: 'le jour ne lit que la branche du TPE, et ne rend ni numero ni nom de famille',
    ok: (s) => /\.eq\('branch_id', tpe\.branch_id\)\.eq\('data->>date', leJour\)/.test(corpsDe(s.fonction, 'jour'))
      && /prenom: prenomDUsage\(fiche, r\.clientName\)/.test(corpsDe(s.fonction, 'jour'))
      && !/phone|clientName:|numero/i.test(corpsDe(s.fonction, 'jour').split('return {')[1] ?? ''),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, ".eq('branch_id', tpe.branch_id).eq('data->>date', leJour)", ".eq('data->>date', leJour)") }),
  },
  {
    dit: 'ouvrir refuse une autre branche, un autre jour, une seance sans piece ou deja reglee',
    ok: (s) => /ligne\.branch_id !== tpe\.branch_id/.test(corpsDe(s.fonction, 'ouvrir'))
      && /if \(!piece\) return json\(\{ ok: false, raison: 'pas-terminee' \}\);/.test(corpsDe(s.fonction, 'ouvrir'))
      && /if \(reste <= 0\) return json\(\{ ok: false, raison: 'reglee' \}\);/.test(corpsDe(s.fonction, 'ouvrir')),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, "if (!piece) return json({ ok: false, raison: 'pas-terminee' });", '') }),
  },
  {
    dit: 'ouvrir garde le lien deja pose, n en tire un que s il manque, et signe le TPE',
    ok: (s) => /const garde = estUnJetonDuLien\(d\.lienDeReglement\?\.jeton\);/.test(corpsDe(s.fonction, 'ouvrir'))
      && /\.\.\.\(garde \? \{\} : \{ jeton: jetonDuLienNeuf\(\), creeLe: marque\.le \}\), tpe: marque/.test(corpsDe(s.fonction, 'ouvrir')),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, '...(garde ? {} : { jeton: jetonDuLienNeuf(), creeLe: marque.le })', '...{ jeton: jetonDuLienNeuf(), creeLe: marque.le }') }),
  },
  {
    dit: 'le rendez-vous s ecrit sous condition (updated_at), jamais par-dessus le Trone',
    ok: (s) => /if \(\(frais as Ligne\)\.updated_at\) q = q\.eq\('updated_at', \(frais as Ligne\)\.updated_at\);/.test(s.fonction),
    casse: (s) => ({ ...s, fonction: sans(s.fonction, "if ((frais as Ligne).updated_at) q = q.eq('updated_at', (frais as Ligne).updated_at);") }),
  },
  {
    dit: 'AUCUN argent ne s ecrit ici : ni registre, ni versement, ni piece, ni caisse',
    ok: (s) => !/from\('payments'\)|from\('invoices'\)\.(update|insert|upsert)|versement|cashbox|paidXof\s*:/.test(s.fonction.split('/* ⟨reste-du-rdv⟩ */')[0] + (s.fonction.split('/* ⟨/reste-du-rdv⟩ */')[1] ?? '')),
    casse: (s) => ({ ...s, fonction: s.fonction.replace("return json({ ok: true, jetonDuLien, resteXof: reste });", "await admin.from('payments').insert({});\n  return json({ ok: true, jetonDuLien, resteXof: reste });") }),
  },
  {
    dit: 'la table : RLS, lue par la direction seule, aucune politique d ecriture',
    ok: (s) => /alter table public\.tpe_de_poche enable row level security;/.test(s.migration)
      && /create policy direction_lit on public\.tpe_de_poche for select to authenticated\s+using \(public\.est_direction\(\)\);/.test(s.migration)
      && !/for (insert|update|delete|all)/i.test(s.migration),
    casse: (s) => ({ ...s, migration: `${s.migration}\ncreate policy p on public.tpe_de_poche for all to authenticated using (true);` }),
  },
  {
    dit: 'le telephone encaisse par la page Regler en mode TPE, a cote de lui',
    ok: (s) => /window\.location\.assign\(`\$\{dossier\(\)\}regler\.html\?r=\$\{encodeURIComponent\(r\.jetonDuLien\)\}&tpe=1`\)/.test(s.telephone),
    casse: (s) => ({ ...s, telephone: remplace(s.telephone, '&tpe=1`', '`') }),
  },
  {
    dit: 'le QR pour son telephone porte son lien, sans le mode TPE',
    ok: (s) => /qr: `\$\{window\.location\.origin\}\$\{dossier\(\)\}payer\.html\?tg=r-\$\{encodeURIComponent\(r\.jetonDuLien\)\}`/.test(s.telephone),
    casse: (s) => ({ ...s, telephone: remplace(s.telephone, 'payer.html?tg=r-${encodeURIComponent(r.jetonDuLien)}`', 'payer.html?tg=r-${encodeURIComponent(r.jetonDuLien)}&tpe=1`') }),
  },
  {
    dit: 'le telephone se verrouille apres deux minutes, et cinq codes faux retirent le TPE',
    ok: (s) => /tpeAVerrouiller\(dernierToucher\(\), Date\.now\(\)\) \? \{ k: 'verrou' \}/.test(s.telephone)
      && /if \(n >= ESSAIS_DU_SECRET\) \{ gardeLeTpe\(null\);/.test(s.telephone) && /const ESSAIS_DU_SECRET = 5;/.test(s.telephone),
    casse: (s) => ({ ...s, telephone: remplace(s.telephone, 'if (n >= ESSAIS_DU_SECRET) { gardeLeTpe(null);', 'if (n >= 999) { gardeLeTpe(null);') }),
  },
  {
    dit: 'le code d activation quitte l adresse des qu il a servi',
    ok: (s) => /window\.history\.replaceState\(null, '', window\.location\.pathname\)/.test(s.telephone),
    casse: (s) => ({ ...s, telephone: sans(s.telephone, "window.history.replaceState(null, '', window.location.pathname)") }),
  },
  {
    dit: 'un TPE coupe s efface du telephone',
    ok: (s) => /if \(r\.raison === 'coupe'\) \{ coupe\(\); return; \}/.test(s.telephone) && /gardeLeTpe\(null\);\s*oublieLeToucher\(\);\s*setTpe\(null\);\s*setVue\(\{ k: 'coupe' \}\);/.test(s.telephone),
    casse: (s) => ({ ...s, telephone: remplace(s.telephone, "if (r.raison === 'coupe') { coupe(); return; }", '') }),
  },
  {
    dit: 'en mode TPE, la page Regler retire le merci, la Gamme, regler a deux et partager',
    ok: (s) => /\{p\.pourboire && !auTpe\(\) && \(/.test(s.regler) && /\{!auTpe\(\) && \(\s*<div className="rg-puces">/.test(s.regler)
      && /\{!p\.parInvitee && !auTpe\(\) && \(/.test(s.regler) && /\{auTpe\(\) \? \(\s*<a className="rg-autre" href="tpe\.html">Revenir au TPE<\/a>/.test(s.regler),
    casse: (s) => ({ ...s, regler: remplace(s.regler, '{p.pourboire && !auTpe() && (', '{p.pourboire && (') }),
  },
  {
    dit: 'en mode TPE, la sortie va droit a « Merci. », et ramene au TPE',
    ok: (s) => /const etape = auTpe\(\) \? 'merci' : /.test(s.regler) && /\{auTpe\(\) && <a className="rg-autre" href="tpe\.html">Revenir au TPE<\/a>\}/.test(s.regler),
    casse: (s) => ({ ...s, regler: remplace(s.regler, "const etape = auTpe() ? 'merci' : ", 'const etape = ') }),
  },
  {
    dit: 'le mode TPE tient dans l onglet (le retour de FedaPay ne porte que r et fp)',
    ok: (s) => /if \(dit\) sessionStorage\.setItem\(CLE_DU_MODE_TPE, '1'\);/.test(s.regler) && /return dit \|\| sessionStorage\.getItem\(CLE_DU_MODE_TPE\) === '1';/.test(s.regler),
    casse: (s) => ({ ...s, regler: remplace(s.regler, "return dit || sessionStorage.getItem(CLE_DU_MODE_TPE) === '1';", 'return dit;') }),
  },
  {
    dit: 'l ecran de la direction passe par la fonction, jamais par la table',
    ok: (s) => /gesteDuTpe\('autoriser'/.test(s.trone) && /gesteDuTpe\('preparer'/.test(s.trone) && /gesteDuTpe\('couper'/.test(s.trone)
      && !/from\('tpe_de_poche'\)\.(update|insert|upsert|delete)/.test(s.trone),
    casse: (s) => ({ ...s, trone: `${s.trone}\n// supabase.from('tpe_de_poche').update({})` }),
  },
  {
    dit: 'l ecran est reserve a la direction et nomme parmi les ecrans nes apres les departements',
    ok: (s) => /export const ROUTES_DIRECTION = \[[^\]]*'\/tpe-de-poche'/.test(s.routes) && /ECRANS_NES_APRES_LES_DEPARTEMENTS: readonly string\[\] = \[[^\]]*'\/tpe-de-poche'/.test(s.routes)
      && /\{ path: '\/tpe-de-poche', label: 'TPE de poche',[^\n]*import\('\.\/vente\/TpeDePoche'\)/.test(s.routes),
    casse: (s) => ({ ...s, routes: remplace(s.routes, ", '/demander', '/tpe-de-poche']", ", '/demander']") }),
  },
  {
    dit: 'tpe.html se construit avec le portail, a cote de regler.html',
    ok: (s) => /tpe: resolve\(__dirname, 'tpe\.html'\),/.test(s.vite) && /apps: 'portail,tpe,regler',/.test(s.sites),
    casse: (s) => ({ ...s, sites: remplace(s.sites, "apps: 'portail,tpe,regler',", "apps: 'portail,tpe',") }),
  },
  {
    dit: 'Trone Terminal s installe : son manifeste (nom, tpe.html, plein ecran, icones 192 et 512) et tpe.html qui le cite',
    ok: (s) => {
      let m = null;
      try { m = JSON.parse(s.manifeste); } catch { /* illisible */ }
      return !!m && m.name === 'Trône Terminal' && m.id === 'tpe.html' && m.start_url === 'tpe.html?app=terminal' && m.display === 'standalone'
        && ['192x192', '512x512'].every((t) => (m.icons ?? []).some((i) => i.sizes === t))
        && /<link rel="manifest" href="\/manifest\.tpe\.webmanifest" \/>/.test(s.page);
    },
    casse: (s) => ({ ...s, page: sans(s.page, '<link rel="manifest" href="/manifest.tpe.webmanifest" />') }),
  },
  {
    dit: 'le service de l app a une portee etroite (…/tpe) : il ne remplace jamais celui du Trone',
    ok: (s) => /register\(`\$\{base\}tpe-sw\.js`, \{ scope: `\$\{base\}tpe`/.test(s.telephone) && /req\.mode !== 'navigate'/.test(s.service),
    casse: (s) => ({ ...s, telephone: remplace(s.telephone, 'scope: `${base}tpe`', 'scope: base') }),
  },
  {
    dit: 'sur iPhone, dans Safari, le code ne se consomme pas d emblee : l app d abord',
    ok: (s) => /dAbordLApp: estUnIphone\(\) && !estAutonome\(\)/.test(s.telephone) && /!vue\.dAbordLApp && !activationLancee\.current/.test(s.telephone),
    casse: (s) => ({ ...s, telephone: remplace(s.telephone, '!vue.dAbordLApp && !activationLancee.current', '!activationLancee.current') }),
  },
  {
    dit: 'seul un toucher sur le TPE ouvert le garde ouvert ; un code faux n entretient rien',
    ok: (s) => /const touche = \(\) => \{ if \(ouvert\.current\) noteLeToucher\(\); \};/.test(s.telephone)
      && /ouvert\.current = vue\.k === 'liste' \|\| vue\.k === 'rdv';/.test(s.telephone)
      && /setSaisie\(''\);\s*\/\* Un code faux n'ouvre rien, et n'entretient rien\. \*\/\s*oublieLeToucher\(\);/.test(s.telephone),
    casse: (s) => ({ ...s, telephone: remplace(s.telephone, 'const touche = () => { if (ouvert.current) noteLeToucher(); };', 'const touche = () => { noteLeToucher(); };') }),
  },
  {
    dit: 'ouverte dans une autre app, la page le dit et donne son adresse a ouvrir dans le navigateur',
    ok: (s) => /const dansUneAutreApp = \(\): boolean => estAutonome\(\) && !lanceeParLeTerminal\(\);/.test(s.telephone)
      && /<p className="tp-adresse">\{adresseSansMarque\(\)\}<\/p>\s*<CopierLAdresse \/>/.test(s.telephone) && /if \(dansUneAutreApp\(\)\) \{/.test(s.telephone)
      && /await navigator\.clipboard\.writeText\(adresseSansMarque\(\)\);/.test(s.telephone),
    casse: (s) => ({ ...s, telephone: remplace(s.telephone, 'if (dansUneAutreApp()) {', 'if (false) {') }),
  },
  {
    dit: 'Trone Terminal vit sur le portail, hors de la portee de l app Le Trone ; le QR du Trone y mene',
    ok: (s) => /export const CHEMIN_DU_TERMINAL = '\/mnd-platform\/';/.test(s.pur)
      && /const dossier = import\.meta\.env\.DEV \? '\/' : CHEMIN_DU_TERMINAL;/.test(s.trone)
      && /name: 'mnd-platform',[\s\S]*?apps: 'portail,tpe,regler',/.test(s.sites)
      && /const ancienne = !import\.meta\.env\.DEV && window\.location\.pathname\.startsWith\('\/trone\/'\);/.test(s.entree)
      && /window\.location\.replace\(`\$\{CHEMIN_DU_TERMINAL\}tpe\.html\$\{window\.location\.search\}`\)/.test(s.entree),
    casse: (s) => ({ ...s, sites: remplace(s.sites, "apps: 'portail,tpe,regler',", "apps: 'portail',") }),
  },
  {
    dit: 'le banc du prenom d usage tient aussi la copie de tpe-de-poche',
    ok: (s) => /const AVEC_BLOC = \[[^\]]*'tpe-de-poche'/.test(s.prenoms),
    casse: (s) => ({ ...s, prenoms: remplace(s.prenoms, ", 'tpe-de-poche'", '') }),
  },
  /* ── LE LOT 2 (26 novembre 2026) ── */
  {
    dit: 'lot 2 : ouvrir juge les plafonds sur ce que le TPE a engage, et signe le montant d alors',
    ok: (s) => /const verdict = plafondDuTpe\(reste, await engageAujourdhui\(tpe, leJour, rdvId\)\);\s*if \(!verdict\.ok\) return json\(\{ ok: false, raison: verdict\.raison, resteDuJourXof: verdict\.resteDuJourXof \}\);/.test(corpsDe(s.fonction, 'ouvrir'))
      && /le: new Date\(\)\.toISOString\(\), montantXof: reste \};/.test(corpsDe(s.fonction, 'ouvrir')),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, 'if (!verdict.ok) return json({ ok: false, raison: verdict.raison, resteDuJourXof: verdict.resteDuJourXof });\n  const marque', 'const marque') }),
  },
  {
    dit: 'lot 2 : une seance aux especes declarees ne se rouvre pas sur un TPE',
    ok: (s) => /if \(\(declarees \?\? \[\]\)\.length > 0\) return json\(\{ ok: false, raison: 'especes' \}\);/.test(corpsDe(s.fonction, 'ouvrir')),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, "if ((declarees ?? []).length > 0) return json({ ok: false, raison: 'especes' });", '') }),
  },
  {
    dit: 'lot 2 : le plafond du jour compte les ouvertures ET les especes du TPE',
    ok: (s) => /return engageDuJour\(\[\.\.\.engagementsDesOuvertures\(rdvs, tpe\.membre_id, leJour\), \.\.\.engagementsDesEspeces\(lesEspeces, tpe\.membre_id, leJour\)\], saufRdvId\);/.test(corpsDe(s.fonction, 'engageAujourdhui')),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, ', ...engagementsDesEspeces(lesEspeces, tpe.membre_id, leJour)], saufRdvId);', '], saufRdvId);') }),
  },
  {
    dit: 'lot 2 : les especes ne se declarent que si la direction les a ouvertes, sur une seance du jour qui doit encore',
    ok: (s) => /if \(tpe\.especes !== true\) return json\(\{ ok: false, raison: 'especes-fermees' \}, 403\);/.test(corpsDe(s.fonction, 'especes'))
      && /const s = await laSeanceDuTpe\(tpe, b\.rdvId\);/.test(corpsDe(s.fonction, 'especes'))
      && /ligne\.branch_id !== tpe\.branch_id/.test(corpsDe(s.fonction, 'laSeanceDuTpe'))
      && /if \(!piece\) return \{ ok: false, raison: 'pas-terminee', status: 200 \};/.test(corpsDe(s.fonction, 'laSeanceDuTpe'))
      && /if \(reste <= 0\) return \{ ok: false, raison: 'reglee', status: 200 \};/.test(corpsDe(s.fonction, 'laSeanceDuTpe')),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, "if (tpe.especes !== true) return json({ ok: false, raison: 'especes-fermees' }, 403);", '') }),
  },
  {
    dit: 'lot 2 : une declaration par seance, sous les plafonds, et rien d autre que la table des especes',
    ok: (s) => {
      const c = corpsDe(s.fonction, 'especes');
      return /if \(\(deja \?\? \[\]\)\.length > 0\) return json\(\{ ok: true, deja: true,/.test(c)
        && /const verdict = plafondDuTpe\(s\.reste, await engageAujourdhui\(tpe, s\.leJour, rdvId\)\);/.test(c)
        && /admin\.from\('tpe_especes'\)\.insert\(\{/.test(c) && /statut: 'a-remettre',/.test(c)
        && !/from\('(invoices|appointments|payments)'\)\.(insert|update|upsert)/.test(c);
    },
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, 'const verdict = plafondDuTpe(s.reste, await engageAujourdhui(tpe, s.leJour, rdvId));', 'const verdict = { ok: true } as any;') }),
  },
  {
    dit: 'lot 2 : ouvrir les especes et les dire recues ou refusees passent par la porte de la direction',
    ok: (s) => /if \(action === 'especes-permises' \|\| action === 'especes-traitees'\) \{\s*const qui = await laDirection\(req\);\s*if \(!qui\) return json\(\{ ok: false, raison: 'refusee' \}, 403\);/.test(s.fonction),
    casse: (s) => ({ ...s, fonction: s.fonction.replace(/(if \(action === 'especes-permises' \|\| action === 'especes-traitees'\) \{\s*const qui = await laDirection\(req\);\s*)if \(!qui\) return json\(\{ ok: false, raison: 'refusee' \}, 403\);/, '$1') }),
  },
  {
    dit: 'lot 2 : une declaration ne se traite qu une fois, depuis « a remettre », en reçue ou refusee',
    ok: (s) => /if \(!id \|\| !estUnStatutTraite\(b\.statut\)\) return json/.test(corpsDe(s.fonction, 'especesTraitees'))
      && /\.eq\('id', id\)\.eq\('statut', 'a-remettre'\)\.select\('id'\);/.test(corpsDe(s.fonction, 'especesTraitees'))
      && /if \(!ligne \|\| !ligne\.autorise\) return json\(\{ ok: false, raison: 'pas-autorise' \}, 403\);/.test(corpsDe(s.fonction, 'especesPermises')),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, ".eq('id', id).eq('statut', 'a-remettre').select('id');", ".eq('id', id).select('id');") }),
  },
  {
    dit: 'lot 2 : le jour rend le total du soir, ce qui reste du plafond, et les seances aux especes declarees',
    ok: (s) => /const total = totalDuSoir\(rdvs, lesEspeces, tpe\.membre_id, leJour\);/.test(corpsDe(s.fonction, 'jour'))
      && /etat: etatAuTpe\(!!piece, reste, enAttente\.has\(r\.id\)\)/.test(corpsDe(s.fonction, 'jour'))
      && /lignes: sortie, \.\.\.enPlus \}\);/.test(corpsDe(s.fonction, 'jour')),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, 'etat: etatAuTpe(!!piece, reste, enAttente.has(r.id))', 'etat: etatAuTpe(!!piece, reste)') }),
  },
  {
    dit: 'lot 2 : la table des especes, RLS, lue par la direction seule, une seule en attente par seance, especes fermees par defaut',
    ok: (s) => /alter table public\.tpe_especes enable row level security;/.test(s.lot2)
      && /create policy direction_lit on public\.tpe_especes for select to authenticated\s+using \(public\.est_direction\(\)\);/.test(s.lot2)
      && !/for (insert|update|delete|all)/i.test(s.lot2)
      && /on public\.tpe_especes \(rdv_id\) where statut = 'a-remettre';/.test(s.lot2)
      && /add column if not exists especes boolean not null default false;/.test(s.lot2),
    casse: (s) => ({ ...s, lot2: remplace(s.lot2, 'especes boolean not null default false;', 'especes boolean not null default true;') }),
  },
  {
    dit: 'lot 2 : le telephone n offre les especes que si le TPE les prend, et les fait confirmer',
    ok: (s) => /\{jour\.especes && \(\s*<button type="button" className="tp-moyen" onClick=\{\(\) => setVue\(\{ k: 'rdv', ligne: l, especes: 'confirmer' \}\)\}>/.test(s.telephone)
      && /onClick=\{\(\) => \{ void declare\(l\); \}\}/.test(s.telephone)
      && /const r = await declareLesEspeces\(t\.jeton, ligne\.id\);/.test(s.telephone),
    casse: (s) => ({ ...s, telephone: remplace(s.telephone, '{jour.especes && (', '{(') }),
  },
  {
    dit: 'lot 2 : l ecran de la direction encaisse les especes par l ecran habituel, puis les marque reçues',
    ok: (s) => /<PayAppointmentModal\s+appt=\{encaisse\.rdv\}\s+onEncaisse=\{\(\) => \{ void marqueRecue\(encaisse\.ligne\); \}\}/.test(s.trone)
      && /gesteDuTpe\('especes-traitees', \{ id: l\.id, statut: 'recue' \}\)/.test(s.trone)
      && /gesteDuTpe\('especes-permises', \{ branchId: branch\.id, membreId: m\.id, oui \}\)/.test(s.trone)
      && !/from\('tpe_especes'\)\.(update|insert|upsert|delete)/.test(s.trone + s.magasin),
    casse: (s) => ({ ...s, trone: remplace(s.trone, 'onEncaisse={() => { void marqueRecue(encaisse.ligne); }}', '') }),
  },
];

for (const c of controles) {
  const ok = c.ok(sources);
  if (!prouve) dit(c.dit, ok);
  else {
    const vu = !c.ok(c.casse(sources));
    dit(`prouve : ${c.dit}`, ok && vu, ok ? 'la panne passe inapercue' : 'le controle echoue deja sans panne');
  }
}

/* La fonction se lit (esbuild la transpile sans erreur). */
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
