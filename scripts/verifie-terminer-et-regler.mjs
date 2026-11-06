import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* TERMINER ET REGLER, EPROUVE - 6 novembre 2026.
   `node scripts/verifie-terminer-et-regler.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. Une preuve ne tourne jamais dans l'arbre commun :
   seulement dans une copie propre detachee. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/terminer-et-regler-pur.ts';
const PANNES = [
  ['la porte s ouvre avant l heure du rituel', PUR, "  if (!Number.isFinite(debut) || o.maintenantMs < debut) return ferme('avant-l-heure');", "  if (!Number.isFinite(debut)) return ferme('avant-l-heure');"],
  ['la porte reste ouverte apres minuit', PUR, "  if (jour < aujourdhui) return ferme('jour-passe');\n", ''],
  ['la porte s ouvre la veille', PUR, "  if (jour > aujourdhui) return ferme('pas-encore-le-jour');\n", ''],
  ['un rendez-vous annule ouvre la porte', PUR, "  if (r.status === 'annulé') return ferme('annule');\n  if (o.piece) {", '  if (o.piece) {'],
  ['un rendez-vous deja regle ouvre la porte', PUR, "    if (connu !== null && connu <= 0) return ferme(argentRecuDeLaFin(r) > 0 ? 'deja-regle' : 'rien-a-regler');", ''],
  ['une piece soldee ouvre encore la porte', PUR, "    if (Math.round(reste) <= 0) return ferme('deja-regle');\n", ''],
  ['une seance couverte par une formule ouvre la porte', PUR, "  } else if (r.coveredBySub) {\n    return ferme('rien-a-regler');\n", "  } else if (false) {\n    return ferme('rien-a-regler');\n"],
  ['« Passe au comptoir » n eteint plus rien', PUR, "  if (o.passeAuComptoir === true) return ferme('comptoir');\n", ''],
  ['un rendez-vous en attente ouvre la porte', PUR, "  if (r.status !== 'confirmé' && r.status !== 'honoré') return ferme('pas-confirme');\n", ''],
  ['un honore sans piece rouvre la porte', PUR, "  } else if (r.status === 'honoré') {\n    return ferme('clos');\n", "  } else if (false) {\n    return ferme('clos');\n"],
  ['Cotonou a l heure de Londres', PUR, 'export const DECALAGE_DE_LA_FIN_MS = 3_600_000;', 'export const DECALAGE_DE_LA_FIN_MS = 0;'],
  ['un acompte seulement demande se deduit', PUR, '  + (a.depositConfirmed ? Math.max(0, Number(a.depositXof) || 0) : 0);', '  + Math.max(0, Number(a.depositXof) || 0);'],
  ['la remise du rendez-vous oubliee', PUR, "  return Math.max(0, Math.round(a.priceXof * (1 - (Number(a.discountPct) || 0) / 100)) - (Number(a.discountXof) || 0));\n}\n\n/** L'argent", "  return Math.max(0, Math.round(a.priceXof));\n}\n\n/** L'argent"],
  ['la piece lue autrement que la page Regler', PUR, "p.payments.reduce((s, v) => s + nombreDeLaFin(v.amountXof), 0) : p.status === 'payée' ? total : 0;", 'p.payments.reduce((s, v) => s + nombreDeLaFin(v.amountXof), 0) : 0;'],
  ['une piece annulee passe pour la sienne', PUR, " && p.status !== 'annulée');\n  if (!siennes.length) return null;\n  return [...siennes].sort((a, b) => (resteDeLaPieceDeLaFin(b)", ");\n  if (!siennes.length) return null;\n  return [...siennes].sort((a, b) => (resteDeLaPieceDeLaFin(b)"],
  ['le code seul ouvre', PUR, '    if (proche && memeCode && memesChiffres) trouves.push(r);', '    if (proche && memeCode) trouves.push(r);'],
  ['les chiffres seuls ouvrent', PUR, '    if (proche && memeCode && memesChiffres) trouves.push(r);', '    if (proche && memesChiffres) trouves.push(r);'],
  ['la recherche sans borne', PUR, '    const proche = jour >= f.du && jour <= f.au;', '    const proche = true;'],
  ['la recherche remonte au-dela d hier', PUR, 'export const JOURS_AVANT_DE_LA_RECHERCHE = 1;', 'export const JOURS_AVANT_DE_LA_RECHERCHE = 30;'],
  ['un annule passe devant un vivant', PUR, "(a.status === 'annulé' ? 1 : 0) - (b.status === 'annulé' ? 1 : 0) || ecart(a) - ecart(b)", 'ecart(a) - ecart(b)'],
  ['trois chiffres suffisent', PUR, '  return c.length === 4 ? c : null;', '  return c.length >= 3 ? c : null;'],
  ['un signe hors de l alphabet passe pour un code', PUR, "  if (corps.length !== 4 || [...corps].some((c) => !SIGNES_DU_CODE_DE_LA_FIN.includes(c))) return null;", '  if (corps.length !== 4) return null;'],
  ['le frein par code leve', PUR, "  if (o.echecsDuCodeDansLHeure >= FREIN_DE_LA_RECHERCHE.echecsParHeure || o.echecsDuCodeDuJour >= FREIN_DE_LA_RECHERCHE.echecsParJour) return 'code';\n", ''],
  ['le frein par adresse leve', PUR, "  if (o.essaisDeLAdresse >= FREIN_DE_LA_RECHERCHE.parAdresse) return 'adresse';\n", ''],
  ['le frein desserre', PUR, 'echecsParHeure: 5, echecsParJour: 12', 'echecsParHeure: 500, echecsParJour: 1200'],
  ['le billet dit son nom entier', PUR, "    prenom: String(o.prenom ?? '').trim().split(/\\s+/)[0] ?? '',", "    prenom: String(o.prenom ?? '').trim(),"],
  ['le billet invente un montant sans prix fige', PUR, "  return prix === undefined ? null : Math.max(0, prix - argentRecuDeLaFin(a));", '  return Math.max(0, (prix ?? 0) - argentRecuDeLaFin(a));'],
  ['un jeton que la page Regler ne reconnait pas', PUR, "export const SIGNES_DU_JETON_DE_LA_FIN = '23456789abcdefghjkmnpqrstuvwxyz';", "export const SIGNES_DU_JETON_DE_LA_FIN = '0123456789abcdefghjkmnpqrstuvwxyz';"],
  ['l adresse du reglement mene ailleurs', PUR, "'https://maisonmnd.com/trone/payer.html?tg=r-'", "'https://maisonmnd.com/trone/payer.html?tg='"],
  ['un second toucher tire un autre lien', PUR, "    return estUnJetonDeLaFin(deja) ? { genre: 'seul', jeton: deja, neuf: false, apptIds: ids } : ", '    return '],
  ['le foyer garde un lien fait pour une autre liste', PUR, " && [...(l.apptIds ?? [])].sort().join('|') === ids.join('|'));", ');'],
  ['honore a la declaration, sans reglement', PUR, '  if (!Number.isFinite(reste) || Math.round(reste) > 0) return null;', '  if (!Number.isFinite(reste)) return null;'],
  ['honore sans declaration', PUR, '  if (!r || !r.termineParElle || !r.termineParElle.le) return null;', '  if (!r) return null;'],
  ['un rituel a venir honore', PUR, ' || jour > jourDeLaFin(o.maintenantMs)) return null;', ') return null;'],
  ['un reste illisible honore', PUR, '  if (!Number.isFinite(reste) || Math.round(reste) > 0) return null;', '  if (Math.round(reste) > 0) return null;'],
  ['un annule honore', PUR, "  if (r.status !== 'confirmé') return null;\n  const reste", '  const reste'],
  ['une declaration d avant l heure tient', PUR, '  return Number.isFinite(debut) && le >= debut && jourDeLaFin(le)', '  return Number.isFinite(debut) && jourDeLaFin(le)'],
  ['une declaration du lendemain tient', PUR, " && jourDeLaFin(le) === String(r.date ?? '').slice(0, 10);", ';'],
  ['la notification dit « Elle »', PUR, 'Règlement en cours depuis son téléphone, par', 'Elle règle depuis son téléphone, par'],
  ['une negation passe pour une declaration', PUR, '/\\b(pas|jamais|quand|', '/\\b(jamais|quand|'],
  ['un autre achat passe pour une declaration', PUR, '|abonnement|formule|commande|', '|formule|'],
  ['une longue phrase passe pour une declaration', PUR, "  if (!t || t.split(' ').length > 14) return false;", '  if (!t) return false;'],
  ['« je veux regler » n est plus reconnu', PUR, '  return ELLE_A_FINI.test(t) || FIN_EN_PEU_DE_MOTS.test(t) || ELLE_VEUT_REGLER.test(t);', '  return ELLE_A_FINI.test(t) || FIN_EN_PEU_DE_MOTS.test(t);'],
  ['« termine » seul n est plus reconnu', PUR, '  return ELLE_A_FINI.test(t) || FIN_EN_PEU_DE_MOTS.test(t) || ELLE_VEUT_REGLER.test(t);', '  return ELLE_A_FINI.test(t) || ELLE_VEUT_REGLER.test(t);'],
  ['un mot apres MND passe pour un code', PUR, "  if (m[1] !== '-' && !/\\d/.test(signes) && signes !== signes.toUpperCase()) return null;\n", ''],
  ['un lien de reglement part sans rendez-vous', PUR, '  const lien = o.code ? `${PAGE_POUR_RETROUVER_SON_RDV}?code=${o.code}` : PAGE_POUR_RETROUVER_SON_RDV;', "  const lien = 'https://maisonmnd.com/trone/payer.html?tg=r-22222222222222';"],
  ['un montant invente sur WhatsApp', PUR, '    const montant = o.resteXof !== null && o.resteXof > 0\n', '    const montant = true\n'],
  ['« deja regle » ne se dit plus', PUR, "votre rituel d'aujourd'hui est déjà réglé. Merci", "votre rituel d'aujourd'hui vous attend. Merci"],
  ['le Carnet dit « reglee » avant le reglement', PUR, "  if (r.honoreAuReglement?.le || (resteXof !== null && resteXof <= 0)) {", '  if (r.termineParElle?.le) {'],
  ['le Trone prepare une piece sans declaration valable', PUR, "  return !aDejaSaPiece && r.status === 'confirmé' && finValable(r);", "  return !aDejaSaPiece && r.status === 'confirmé';"],
  ['le Trone prepare deux pieces', PUR, "  return !aDejaSaPiece && r.status === 'confirmé' && finValable(r);", "  return r.status === 'confirmé' && finValable(r);"],
  ['les suites se font deux fois', PUR, ' && !r.honoreAuReglement.suitesLe;', ';'],
  ['Ma Couronne montre le bouton porte fermee', PUR, "    if (porte.ouverte) return { rdv, etat: 'en-cours', porte };", "    return { rdv, etat: 'en-cours', porte };"],
  ['Ma Couronne dit « vous pouvez partir » avant le reglement', PUR, "    if (rdv.termineParElle?.le && (rdv.honoreAuReglement?.le || porte.raison === 'deja-regle')) return { rdv, etat: 'regle', porte };", "    if (rdv.termineParElle?.le) return { rdv, etat: 'regle', porte };"],
  ['Ma Couronne garde « termine » sur un rendez-vous d hier', PUR, "    .filter((r) => String(r.date ?? '').slice(0, 10) === aujourdhui)\n", ''],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-terminer-et-regler');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-terminer-et-regler.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((x) => x[1]))];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  try {
    for (const [nom, f, a, b] of PANNES) {
      const garde = gardes.get(f);
      const brut = garde.toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, () => b);
      writeFileSync(path.join(racine, f), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, f), garde);
      }
    }
  } finally {
    for (const [f, g] of gardes) writeFileSync(path.join(racine, f), g);
  }
  const intacts = fichiers.every((f) => md5(f) === avant.get(f));
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intacts ? 0 : 1);
}

const r = await lanceLeBanc();
process.stdout.write(r.stdout ?? '');
if (r.stderr) process.stdout.write(r.stderr);
process.exit(r.status ?? 1);
