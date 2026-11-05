import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA PAIE DU 5, EPROUVEE - 5 novembre 2026, lot 1 (sur le modele de verifie-la-caisse-au-jour-le-jour).
   `node scripts/verifie-la-paie-du-5.mjs` : le banc, dans un processus fils
   (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-paie-du-5');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-paie-du-5.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k), key: (i) => [...__m.keys()][i] ?? null, get length() { return __m.size; } };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/paie-du-5-pur.ts';
const ECRIT = 'src/apps/trone/routes/equipe/paie-du-5.ts';
const BLOC = 'src/apps/trone/routes/equipe/PaieDu5.tsx';
const PAIE = 'src/apps/trone/routes/equipe/Paie.tsx';
const ESPACE = 'src/apps/trone/routes/equipe/rh/MonEspace.tsx';
const DATA = 'src/apps/trone/routes/equipe/data.ts';
const SQL = 'supabase/migrations/0161_la_paie_du_5.sql';
const AUTH = 'src/shared/auth.ts';
const PANNES = [
  /* Le calendrier */
  ['le dimanche n est plus reporte au lundi', PUR, 'const jour = dimanche ? 6 : 5;', 'const jour = 5;'],
  ['la paie part a 17 h', PUR, 'paie: momentDe(a, m, jour, 18),', 'paie: momentDe(a, m, jour, 17),'],
  ['les confirmations courent jusqu a 14 h', PUR, 'finDesConfirmations: momentDe(a, m, jour, 12),', 'finDesConfirmations: momentDe(a, m, jour, 14),'],
  ['l heure de Cotonou devient l heure UTC', PUR, 'const COTONOU_MS = 60 * 60 * 1000;', 'const COTONOU_MS = 0;'],
  ['le mois ne s elide plus', PUR, 'return /^[aeiouyàâéèêîôû]/i.test(m) ?', 'return false ?'],
  ['le 1er se dit 1', PUR, "${j === 1 ? '1er' : j}", '${j}'],
  /* Le numero */
  ['huit chiffres completes en douce', PUR, '  if (RE_MSISDN.test(c)) return { msisdn: c };', "  if (c.length === 8) c = `22901${c}`;\n  if (RE_MSISDN.test(c)) return { msisdn: c };"],
  ['la garde des sept jours tombe', PUR, 'return { bloque: maintenantMs < jusquAMs && !revalide, revalide, jusquAMs };', 'return { bloque: false, revalide, jusquAMs };'],
  ['une revalidation d avant le changement vaut', PUR, 'const revalide = Number.isFinite(reval) && reval >= change;', 'const revalide = Number.isFinite(reval);'],
  ['un numero change garde sa revalidation', PUR, "  if (avant && avant.numero === lu.msisdn && avant.operateur === operateur) return { mobileMoney: avant };", "  if (avant && avant.operateur === operateur) return { mobileMoney: { ...avant, numero: lu.msisdn } };"],
  /* Le plafond */
  ['le plafond a 50 %', PUR, '(100 + HAUSSE_PERMISE_PCT)) / 100);', '(100 + 2 * HAUSSE_PERMISE_PCT)) / 100);'],
  ['l accord vaut pour tout net', PUR, 'const accorde = !!l.accordPlafond && l.accordPlafond.netXof === net;', 'const accorde = !!l.accordPlafond;'],
  ['un brouillon non paye fait le mois d avant', PUR, "(r.status !== 'brouillon' || estPayee(l))", 'true'],
  /* L etat */
  ['les frais ne sont plus retires', PUR, '    envoyeXof: net - frais.fraisXof,', '    envoyeXof: net,'],
  ['une confirmation perimee vaut', PUR, 'const valable = !l.prestataire && derniere && depotAJour && derniere.cle === cle ? derniere : undefined;', 'const valable = !l.prestataire && derniere ? derniere : undefined;'],
  ['la premiere reponse fait foi', PUR, ".sort((a, b) => (a.le ?? '').localeCompare(b.le ?? ''));", ".sort((a, b) => (b.le ?? '').localeCompare(a.le ?? ''));"],
  ['la reponse d une autre fiche compte', PUR, 'o.confirmationLue && o.confirmationLue.employeeId === l.employeeId ? o.confirmationLue : undefined', 'o.confirmationLue'],
  ['une ligne bloquee part quand meme', PUR, ": blocages.length > 0 ? 'bloquee'", ": false ? 'bloquee'"],
  ['une validation d un autre bulletin vaut', PUR, "l.validation && l.validation.cle === cle && (l.validation.par ?? '').trim() ? 'payable'", "l.validation ? 'payable'"],
  ['l operateur change ne bloque plus', PUR, "if (avecDepot && l.depot && voieFiche && l.depot.voie !== voieFiche) blocages.push(", "if (false) blocages.push("],
  ['une prestataire sans facture acceptee passe', PUR, 'confirmee = !!o.parFacture;', 'confirmee = true;'],
  /* Valider */
  ['valider sans nom', PUR, "if (!(par ?? '').trim()) return { lignes: [...lignes], validees: [], erreur:", "if (false) return { lignes: [...lignes], validees: [], erreur:"],
  ['valider ce qui n est pas confirme', PUR, "if (!lu || lu.etat !== 'confirmee') return l;", "if (!lu || lu.etat === 'payee') return l;"],
  /* Le fichier MTN */
  ['l en-tete dit Saraly', PUR, 'const rangs = [`HDR,Salary,', 'const rangs = [`HDR,Saraly,'],
  ['des fins de ligne nues', PUR, "return { csv: `${rangs.join('\\r\\n')}\\r\\n`, nombre", "return { csv: `${rangs.join('\\n')}\\n`, nombre"],
  ['une ligne vide a la fin', PUR, "return { csv: `${rangs.join('\\r\\n')}\\r\\n`, nombre", "return { csv: `${rangs.join('\\r\\n')}\\r\\n\\r\\n`, nombre"],
  ['une personne deux fois dans le fichier', PUR, '    if (vues.has(l.employeeId)) return', '    if (false) return'],
  ['le fichier prend le Moov', PUR, "lecture.etat === 'payable' && lecture.voie === 'MTN'", "lecture.etat === 'payable' && !!lecture.voie"],
  ['le fichier prend les lignes non validees', PUR, "lecture.etat === 'payable' && lecture.voie === 'MTN'", "(lecture.etat === 'payable' || lecture.etat === 'confirmee') && lecture.voie === 'MTN'"],
  ['le nom garde ses virgules', PUR, ".replace(/[^A-Za-z0-9 -]/g, ' ')", ''],
  /* Le lot */
  ['un lot sans numero', PUR, "  if (!b) return 'Le numéro de lot est obligatoire", "  if (false) return 'Le numéro de lot est obligatoire"],
  ['un lot note deux fois', PUR, "  if (dejaNotes.some(", "  if (false && dejaNotes.some("],
  ['une ligne payee deux fois', PUR, 'if (estPayee(l)) { dejaPayees.push(l.employeeId); return l; }', 'if (false) { dejaPayees.push(l.employeeId); return l; }'],
  ['le lot ne reste pas sur la ligne', PUR, "payeMoyen: 'MTN', payeNote: undefined, lotMtn: b,", "payeMoyen: 'MTN', payeNote: undefined,"],
  /* Les totaux */
  ['les totaux comptent les lignes en attente', PUR, "etats: readonly EtatDeLaPaie[] = ['confirmee', 'payable']", "etats: readonly EtatDeLaPaie[] = ['confirmee', 'payable', 'a-confirmer']"],
  /* Les ecritures */
  ['le depot prend une ligne payee', ECRIT, 'if (l.prestataire || ligneEstPayee(l) || dansLeFichierEnAttente(run, l.employeeId)) return l;', 'if (l.prestataire) return l;'],
  ['redeposer a l identique remet tout a confirmer', ECRIT, 'if (!o.force && l.depot && l.depot.cle === d.cle && l.depot.voie === d.voie) return l;', ''],
  /* Les ecrans */
  ['le bloc absent de la fiche du run', PAIE, '<PaieDu5 run={run} bulletinFor={bulletinFor} />', ''],
  ['une ligne payee se modifie', PAIE, '{editable && !ligneEstPayee(l) && !dansLeFichierEnAttente(run, l.employeeId) && <button', '{editable && <button'],
  ['le bulletin publie perd son depot', PAIE, '      ...(anciens.get(`${run.id}:${l.employeeId}`) ?? {}),\n', ''],
  ['« C est envoye » sans numero de lot', BLOC, 'disabled={fige || !lot.trim()} onClick={() => void cEstEnvoye()}', 'disabled={fige} onClick={() => void cEstEnvoye()}'],
  ['le lot n est plus relu', BLOC, '    if (refus) { setErreurLot(refus); return; }', '    if (false) { setErreurLot(refus); return; }'],
  ['le fichier MTN porte une marque d octets', BLOC, "new Blob([f.csv], { type: 'text/csv' })", "new Blob(['\\uFEFF' + f.csv], { type: 'text/csv' })"],
  ['Mon espace sans « Je signale une erreur »', ESPACE, '>Je signale une erreur</Button>', '>Signaler</Button>'],
  ['Mes bulletins montre les bulletins deposes', ESPACE, 'b.employeeId === moi.id && !!b.publieLe)', 'b.employeeId === moi.id)'],
  ['le numero sort du dossier prive', DATA, "  'mobileMoney',\n] as const;", '] as const;'],
  ['n importe qui efface une reponse', SQL, 'for delete to authenticated\n  using (public.is_souverain());', 'for delete to authenticated\n  using (true);'],
  ['une reponse pour le bulletin d une autre', SQL, "and p_id = coalesce(p_data ->> 'runId', '') || ':' || coalesce(p_data ->> 'employeeId', '')", "and p_id is not null"],
  ['les reponses restent sur le poste', AUTH, "  'mnd_paie_confirmations',\n", ''],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); console.log(propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b] of PANNES) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, fichier), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = await lanceLeBanc();
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, fichier), gardes[fichier]);
      }
    }
  } finally {
    for (const f of fichiers) writeFileSync(path.join(racine, f), gardes[f]);
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exitCode = muettes === 0 && intacts ? 0 : 1;
}
