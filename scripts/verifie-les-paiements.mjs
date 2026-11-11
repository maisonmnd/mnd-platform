import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES PAIEMENTS, EPROUVES - 5 novembre 2026 (maquette
   maquette-les-paiements.html, v5, « construis »).
   La regle (shared/les-paiements-pur.ts), l'ecran et sa route :
   - le pont : salaires nets - prets + prestataires + entreprises = par MTN ;
     les pourboires en especes, jamais dans le virement ;
   - la date de chacun : le 10 par defaut, 1 a 28 ou dernier jour, dimanche
     au lundi, 18 h de Cotonou ; avant le 5, un toucher a part ; une date
     changee apres le toucher, la ligne attend son toucher ;
   - l'entreprise : un fournisseur, payee sur son montant du mois, en depense
     de fournisseur ; la facture est facultative (11 nov. 2026), sans
     montant rien ne part ;
   - le nom chez MTN (null tenu : « nom pas encore lu »), le solde inconnu
     dit sans chiffre invente ;
   - le test : 500 F, 500 F, 100 F, jamais plus de 500 F, relance a 500 F ;
   - la route au souverain seul, l'equipe prevenue (0164), pas les autres.
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. Personnes dites par leurs initiales, numeros et
   montants inventes. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/les-paiements-pur.ts';
const ECRAN = 'src/apps/trone/routes/equipe/LesPaiements.tsx';
const MAGASIN = 'src/apps/trone/routes/equipe/les-paiements.ts';
const INDEX = 'src/apps/trone/routes/index.tsx';
const STYLE = 'src/apps/trone/routes/equipe/les-paiements.css';
const PANNES = [
  /* Les dates */
  ['le dimanche reste un dimanche', PUR, '  const dimanche = new Date(Date.UTC(a, mo - 1, j)).getUTCDay() === 0;', '  const dimanche = false;'],
  ['le dernier jour devient le 28', PUR, "  const j = jour === 'dernier' ? dernier :", "  const j = jour === 'dernier' ? 28 :"],
  ['une date avant le 5 passe dans le toucher du mois', PUR, "    avantLe5: jour !== 'dernier' && j < 5,", '    avantLe5: false,'],
  ['le depart a l heure UTC', PUR, '  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mn) - HEURE_MS;', '  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mn);'],
  /* L'heure et les employes des entreprises (11 nov. 2026) */
  ['l heure reglee ignoree, tout a 18 h', PUR, "  const h = heureLue(heure);\n", "  const h = HEURE_PAR_DEFAUT; void heure;\n"],
  ['une heure changee garde son envoi', PUR, '  const dateChangee = !!v && (v.jour !== o.jour || heureLue(v.heure) !== heure);', '  const dateChangee = !!v && v.jour !== o.jour;'],
  ['la date passee repart a 18 h quelle que soit l heure', PUR, "  const [hh, mn] = heureLue(l.heure ?? l.date.heure).split(':').map(Number);", '  const [hh, mn] = [18, 0];'],
  ['un employe retire se paie encore', PUR, '(!e.retireApres || periode <= e.retireApres)', 'true'],
  ['un employe ajoute paie les mois d avant', PUR, '(!e.dePeriode || e.dePeriode <= periode)', 'true'],
  ['le montant du mois oublie, le mensuel part', PUR, '  return Number.isInteger(pose) && (pose as number) >= 0 ? pose as number : Math.max(0, entier(e.mensuelXof));', '  return Math.max(0, entier(e.mensuelXof));'],
  ['la garde revient sur les employes d entreprise', ECRAN, '            arret: arretDesPeriodes(periode, choisies, prisAilleurs), periodes: choisies,\n', "            arret: e.mobileMoney && gardeDuNumero(e.mobileMoney, maintenant).bloque ? 'garde' : arretDesPeriodes(periode, choisies, prisAilleurs), periodes: choisies,\n"],
  ['le solde masque se montre quand meme', ECRAN, "{soldeMasque ? '•••••• F' : dernierSolde?.soldeXof", "{false ? '•••••• F' : dernierSolde?.soldeXof"],
  /* Plusieurs mois d'un coup (11 nov. 2026) */
  ['un mois pris ailleurs se recoche', PUR, "  const choisies = [...new Set(base)].filter((p) => /^\\d{4}-\\d{2}$/.test(p) && !prisAilleurs[p]).sort();", "  const choisies = [...new Set(base)].filter((p) => /^\\d{4}-\\d{2}$/.test(p)).sort();"],
  ['les mois coches ne multiplient pas', PUR, '  return ici + autres * Math.max(0, entier(o.mensuel));', '  return ici;'],
  ['le toucher oublie les mois', PUR, '    ...(l.periodes?.length ? { periodes: [...l.periodes] } : {}),\n', ''],
  ['une validation sans mois ne prend pas sa periode', PUR, '    for (const p of v.periodes?.length ? v.periodes : [x]) prisAilleurs[p] = x;', '    for (const p of v.periodes ?? []) prisAilleurs[p] = x;'],
  ['la depense de l employe tait les mois', PUR, '    label: `${fournisseur.nom} - ${employe.nom} - ${periodesDites(periodes?.length ? periodes : [envoi.periode])}`,', '    label: `${fournisseur.nom} - ${employe.nom} - ${moisDit(envoi.periode)}`,'],
  ['l equipe perd sa garde des sept jours', PUR, "  pose('numero-garde', de((l) => l.genre === 'equipe' && !!o.lectures?.get(l.id)?.blocages.some((b) => b.code === 'numero-recent')), true);", "  pose('numero-garde', [], true);"],
  ['une entreprise a employes compte autant d entreprises que d employes', PUR, "      else if (!groupesParMtn.has(l.entrepriseId)) { groupesParMtn.add(l.entrepriseId); c.nbEntreprises += 1; }", '      else c.nbEntreprises += 1;'],
  ['la depense de l employe en Salaires', PUR, "    category: CATEGORIE_DES_ENTREPRISES,\n    laMaisonAPaye: true,\n    fournisseurId: fournisseur.id,\n    ...(facture?.piece", "    category: 'Salaires',\n    laMaisonAPaye: true,\n    fournisseurId: fournisseur.id,\n    ...(facture?.piece"],
  ['l annulation apres 18 h', PUR, '  paieMs != null && Number.isFinite(paieMs) && maintenantMs < paieMs;', '  paieMs != null && Number.isFinite(paieMs) && maintenantMs < paieMs + 3_600_000;'],
  ['l ecran ouvre le mois en cours', PUR, '  return m === 1 ? `${a - 1}-12` : `${a}-${p2(m - 1)}`;', '  return `${a}-${p2(m)}`;'],
  /* Le pont et les pourboires */
  ['les pourboires partent par MTN', PUR, '  const parMtn = Math.max(0, envoye);', '  const parMtn = Math.max(0, envoye + especes);'],
  ['le pont oublie les prets', PUR, '      c.salairesNetsXof += l.parMtnXof + l.pretXof;', '      c.salairesNetsXof += l.parMtnXof;'],
  ['les pourboires entrent dans le total MTN', PUR, '    c.parMtnXof += l.parMtnXof;', '    c.parMtnXof += l.parMtnXof + l.pourboiresXof;'],
  ['une ligne Moov compte par MTN', PUR, "  const viaMtn = !!lu && lu.voie === 'MTN' && !!lu.msisdn && parMtn > 0;", '  const viaMtn = !!lu && parMtn > 0;'],
  /* Les lignes a leur date */
  ['la date changee garde son envoi', PUR, "  else if (dateChangee && parLEnvoi !== 'paye' && parLEnvoi !== 'envoi') etat = 'date-changee';\n", ''],
  ['un montant change garde le toucher', PUR, "  else if (v && (v.montantXof !== montant || v.msisdn !== o.msisdn)) etat = 'change';\n", ''],
  ['un toucher a part entre dans le toucher du mois', PUR, "    aValider: etat === 'confirme' && numeroOk,", "    aValider: (etat === 'confirme' || etat === 'toucher-a-part') && numeroOk,"],
  ['une mission sans prix part', PUR, "  else if (o.montantXof == null) { etat = 'ne-part-pas'; pourquoi = 'sans prix'; }\n", ''],
  ['un numero repris part sans « Prendre »', PUR, "  else if (o.numero.etat === 'repris') { etat = 'ne-part-pas'; pourquoi = 'numéro repris, à prendre'; }\n", ''],
  /* L'entreprise */
  ['une entreprise part sans montant', PUR, "  if (!facture || !(Number.isInteger(facture.montantXof) && facture.montantXof > 0)) return 'montant du mois à poser';", "  if (!facture) return 'montant du mois à poser';"],
  ['la depense d entreprise en Salaires', PUR, "export const CATEGORIE_DES_ENTREPRISES = 'Sous-traitance';", "export const CATEGORIE_DES_ENTREPRISES = 'Salaires';"],
  ['la depense d entreprise sans son fournisseur', PUR, '    fournisseurId: fournisseur.id,\n', ''],
  ['une entreprise archivee se paie encore', PUR, '  carnet.filter((f) => f && f.branchId === branchId && !f.archived && !!f.paiement);', '  carnet.filter((f) => f && f.branchId === branchId && !!f.paiement);'],
  /* Le nom et le solde */
  ['un nom different passe', PUR, "  if (accord === 'concorde') return { etat: 'verifie', nomMtn };", "  if (accord !== 'inconnu') return { etat: 'verifie', nomMtn };"],
  ['un nom pas encore lu devient une erreur', PUR, "  if (accord === 'inconnu') return { etat: 'non-lu', nomMtn: null };", "  if (accord === 'inconnu') return { etat: 'differe', nomMtn: null };"],
  ['un solde inconnu devient un chiffre', PUR, "    if (manque == null) out.push({ code: 'solde-inconnu', cles: [], bloque: false });", "    if (manque == null) out.push({ code: 'solde-court', cles: [], bloque: true, manqueXof: o.aCouvrirXof });"],
  /* Le test */
  ['le test a 100 F pour tous', PUR, "  { prenom: 'Yéman', montantXof: 500 },", "  { prenom: 'Yéman', montantXof: 100 },"],
  ['un test au-dela de 500 F', PUR, '    if (l.montantXof > MONTANT_ESSAI_MAX) return', '    if (l.montantXof > 100_000) return'],
  ['un refus du test ne se relance plus a 500 F', PUR, "export const seRelanceA500 = (e: Pick<EnvoiMtn, 'etat' | 'montant_xof'>): boolean => e.etat === 'refuse' && e.montant_xof < MONTANT_ESSAI_MAX;", "export const seRelanceA500 = (e: Pick<EnvoiMtn, 'etat' | 'montant_xof'>): boolean => false && e.etat === 'refuse';"],
  /* Les prets */
  ['le reste du pret oublie le mois', PUR, '  const resteApres = Math.max(0, entier(o.resteAvantXof) - ceMois);', '  const resteApres = Math.max(0, entier(o.resteAvantXof));'],
  /* L'ecran, la route, le serveur */
  ['les prestataires prevenus comme l equipe', ECRAN, "prevenir: genre === 'equipe',", 'prevenir: true,'],
  ['le magasin ne transmet plus prevenir', MAGASIN, 'prevenir: o.prevenir });', 'prevenir: true });'],
  ['la reponse de l employe ne se lit plus', ECRAN, "l.envoi?.reponse_employe === 'bien-recu' ? <span className=\"lp-reponse\">Bien reçu ✓</span>", "l.envoi?.reponse_employe === 'bien-recu' ? null"],
  ['l ecran ouvert a tous', ECRAN, '  if (!estSouverain) {', '  if (false) {'],
  ['les paiements s ouvrent au gerant', INDEX, "'/agents', '/assistants', '/paiements'];", "'/agents', '/assistants'];"],
  ['les paiements quittent les Ressources humaines', INDEX, ", { path: '/paiements', label: 'Les paiements' }", ''],
  ['la barre de validation flotte au-dessus du bord', STYLE, '.lp-pied { position: sticky; bottom: calc(-1 * var(--space-9, 96px));', '.lp-pied { position: sticky; bottom: 0;'],
  ['la prestataire de l equipe perd ses pourboires', PUR, "    pourboiresXof: o.genre === 'prestataire' ? Math.max(0, entier(o.pourboiresDuMoisXof ?? 0)) : 0,", '    pourboiresXof: 0,'],
  ['les pourboires des prestataires ne se comptent pas', PUR, "    if ((l.genre === 'equipe' || l.genre === 'prestataire') && l.pourboiresXof > 0) {", "    if (l.genre === 'equipe' && l.pourboiresXof > 0) {"],
  /* numero invente : le vrai ne s'ecrit nulle part dans le depot public */
  ['le numero du compte de paie revient dans l ecran', ECRAN, "const COMPTE_DE_PAIE = 'compte de paie MTN';", "const COMPTE_DE_PAIE = '01 90 00 00 00';"],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

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
      const casse = texte.replace(a, b);
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

const dossier = path.join(racine, 'node_modules', '.cache', `verifie-les-paiements-${process.pid}`);
mkdirSync(dossier, { recursive: true });
let statut = 1;
try {
  const sortie = path.join(dossier, 'harnais.mjs');
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-les-paiements.harnais.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
  });
  const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  process.stdout.write(r.stdout ?? '');
  if (r.stderr) process.stdout.write(r.stderr);
  statut = r.status ?? 1;
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
process.exit(statut);
