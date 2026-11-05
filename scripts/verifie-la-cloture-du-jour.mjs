import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA CLOTURE DE GRENAT, EPROUVEE (4 novembre 2026).
   `node scripts/verifie-la-cloture-du-jour.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier. Les pannes de la regle vivent dans la memoire du bundle (un
   greffon d'esbuild remplace le texte lu) ; celles de la fonction, de la
   migration et de la copie du bloc, lues par le harnais avec readFileSync,
   vivent dans une copie du depot ecrite dans un dossier temporaire, jamais
   dans le depot : l'empreinte de chaque fichier est comparee avant et apres.
   Une panne dont le texte ne se trouve plus exactement une fois fait echouer
   la preuve. */

const racine = path.resolve(import.meta.dirname, '..');
const P = 'src/shared/cloture-du-jour-pur.ts';
const FN = 'supabase/functions/cloture-du-jour/index.ts';
const SQL = 'supabase/migrations/0156_la_cloture_de_grenat.sql';
const LJ = 'src/apps/trone/routes/finances/LaJournee.tsx';
const PRISE = 'src/apps/trone/routes/finances/useClotureDuJour.ts';
const PARTAGE = 'src/shared/cloture-du-jour.ts';
const VEILLE = 'src/apps/trone/routes/finances/LaVeilleAValider.tsx';
const DEP = 'src/apps/trone/routes/finances/Depenses.tsx';
const CAISSES = 'src/apps/trone/routes/finances/Caisses.tsx';
/* Tout ce que le harnais LIT (readFileSync) : le depot fantome d'une panne
   « disque » les porte tous, sinon la panne crierait d'un fichier absent et
   ne prouverait rien. */
const LUS = [P, FN, SQL, LJ, PRISE, PARTAGE, VEILLE, DEP, CAISSES];

const PANNES = [
  /* Regle 1 : l'etat final. */
  { nom: 'un rendez-vous fini se croit encore en cours', fichier: P, avant: 'const passe = minutesMaintenant >= fin;', apres: 'const passe = minutesMaintenant > fin + 60;' },
  { nom: 'la duree du rendez-vous est oubliee', fichier: P, avant: 'const fin = (debut ?? 0) + Math.max(1, Math.round(Number(a.dureeMin) || 60));', apres: 'const fin = (debut ?? 0) + 60;' },
  { nom: 'le lendemain ne finit rien', fichier: P, avant: 'maintenant.jour > jour ? 24 * 60 + 1', apres: 'maintenant.jour > jour ? 0' },
  { nom: 'l absente reste a clore', fichier: P, avant: "if (a.status === 'annulé') {", apres: "if (a.status === 'annulé' && !a.absente) {" },
  /* Les trois gestes surs. */
  { nom: 'Grenat honore un rendez-vous pas regle', fichier: P, avant: "&& argentDuCarnet(a) + acompteRecu(a) > 0 && resteDuRdv(a) === 0;", apres: '&& true;' },
  { nom: 'l acompte demande compte comme recu', fichier: P, avant: 'a.depositConfirmed ? Math.max(0, Number(a.depositXof) || 0) : 0;', apres: 'Math.max(0, Number(a.depositXof) || 0);' },
  { nom: 'Grenat relie sans comparer le prix', fichier: P, avant: '&& typeof a.prixXof === \'number\' && rituelDeLaPiece(p) === a.prixXof);', apres: ');' },
  { nom: 'Grenat relie avec deux candidats', fichier: P, avant: 'if (candidates.length === 1) {', apres: 'if (candidates.length >= 1) {' },
  { nom: 'une piece deja reliee devient candidate', fichier: P, avant: "const orphelines = pieces.filter((p) => estUneFacture(p) && !p.apptId && !nommees.has(p.id));", apres: 'const orphelines = pieces.filter((p) => estUneFacture(p));' },
  { nom: 'le papier repart quand il est parti', fichier: P, avant: '} else if (p.whatsapp?.partieLe) {', apres: '} else if (false) {' },
  { nom: 'le papier part malgre « Pas de recu ni de facture par WhatsApp »', fichier: P, avant: '} else if (destinataire.sansPapiersWa) {', apres: '} else if (false) {' },
  { nom: 'le retard se voit (papier d un jour passe)', fichier: P, avant: "&& (!o.jourDuRituel || o.jourDuRituel >= o.aujourdhui);", apres: ';' },
  { nom: 'une ligne en salle ne compte pas', fichier: P, avant: "if (ligne && ['en-attente', 'retenu', 'en-envoi', A_PREPARER, 'envoyé'].includes(ligne.statut ?? '')) {", apres: 'if (false) {' },
  { nom: 'une ligne ecartee repart', fichier: P, avant: "} else if (ligne && ligne.statut === 'écarté') {", apres: '} else if (false) {' },
  { nom: 'le geste se croit valable sur une donnee qui a bouge', fichier: P, avant: 'return clotureDuJour(f).gestes.some((x) => x.cle === g.cle', apres: 'return true || clotureDuJour(f).gestes.some((x) => x.cle === g.cle' },
  /* Regle 2. */
  { nom: 'deux factures passent', fichier: P, avant: '} else if (leurs.length > 1) {', apres: '} else if (false) {' },
  { nom: 'le prix de la piece n est pas compare', fichier: P, avant: "if (typeof a.prixXof === 'number' && rituelDeLaPiece(piece) !== a.prixXof) {", apres: 'if (false) {' },
  { nom: 'l argent des deux cotes n est pas compare', fichier: P, avant: 'if (surLaPiece !== auCarnet) {', apres: 'if (false) {' },
  { nom: 'la Gamme compte dans l argent du rituel', fichier: P, avant: "versementsDeLaPiece(p).filter((v) => v.method !== 'Acompte' && !/^Gamme\\b/.test(v.note ?? ''))", apres: "versementsDeLaPiece(p).filter((v) => v.method !== 'Acompte')" },
  { nom: 'la direction ne peut rien trancher', fichier: P, avant: 'const revoir = (cle: string, dit: string) => { if (!tranche.has(cle)) aRevoir.push({ cle, dit }); };', apres: 'const revoir = (cle: string, dit: string) => { aRevoir.push({ cle, dit }); };' },
  /* Regle 3. */
  { nom: 'deux remises passent', fichier: P, avant: 'if (natures.length > 1) revoir(', apres: 'if (natures.length > 2) revoir(' },
  { nom: 'la remise famille en pourcentage se lit comme une remise de la main', fichier: P, avant: 'const pctALaMain = !a.remiseFamille && (Number(a.discountPct) || 0) > 0;', apres: 'const pctALaMain = (Number(a.discountPct) || 0) > 0;' },
  { nom: 'le code honore au comptoir se lit comme la main', fichier: P, avant: "const xofALaMain = (Number(a.discountXof) || 0) - famillePart - comptoirPart > 0;", apres: "const xofALaMain = (Number(a.discountXof) || 0) - famillePart > 0;" },
  { nom: 'la place limitee sur un jour plein passe', fichier: P, avant: 'return avant ? \'la place limitée a été prise un jour qui avait déjà un rendez-vous\' : null;', apres: 'return null;' },
  { nom: 'une place gardee se juge comme neuve', fichier: P, avant: '&& Date.parse(r.creeLe ?? \'\') < posee);', apres: ');' },
  /* Regle 5. */
  { nom: 'une piece payee effacee passe sans alarme', fichier: P, avant: 'if (!avant || !estUneFacture(avant) || !pieceAPaye(avant)) continue;', apres: 'continue;' },
  { nom: 'l argent d une piece perdue n est plus compte', fichier: P, avant: "const sortiDesComptes = alarmes.filter((x) => x.ouverte && x.sort === 'perdue').reduce((s, x) => s + x.argentDuJourXof, 0);", apres: 'const sortiDesComptes = 0;' },
  { nom: 'l ecart de la piece refaite n est pas dit', fichier: P, avant: 'ecart = argentDuRituelSurLaPiece(successeur) - argent;', apres: 'ecart = 0;' },
  { nom: 'une alarme tranchee bloque encore', fichier: P, avant: "const ouverte = !decision && sort !== 'fondue';", apres: "const ouverte = sort !== 'fondue';" },
  { nom: 'une piece fondue bloque', fichier: P, avant: "const ouverte = !decision && sort !== 'fondue';", apres: 'const ouverte = !decision;' },
  { nom: 'le motif n est pas dit', fichier: P, avant: 'if (motif) dit += ` Motif : « ${motif} ».`;', apres: '' },
  /* Regle 6. */
  { nom: 'l avoir entre dans la caisse', fichier: P, avant: "(v.date ?? p.date) === jour && v.method !== 'Avoir' && v.method !== 'Acompte');", apres: "(v.date ?? p.date) === jour && v.method !== 'Acompte');" },
  { nom: 'un versement d hier entre dans la caisse', fichier: P, avant: "(v.date ?? p.date) === jour && v.method !== 'Avoir' && v.method !== 'Acompte');", apres: "v.method !== 'Avoir' && v.method !== 'Acompte');" },
  { nom: 'le devis entre dans la caisse', fichier: P, avant: "if ((p.kind ?? 'facture') !== 'facture') continue;\n    const vs = versementsDuJour(p);", apres: 'const vs = versementsDuJour(p);' },
  { nom: 'le tiroir du versement est oublie', fichier: P, avant: "export const tiroirDuVersement = (p: PieceLue, v: VersementLu): string => v.cashbox ?? p.cashbox ?? 'Caisse principale';", apres: "export const tiroirDuVersement = (p: PieceLue, v: VersementLu): string => p.cashbox ?? 'Caisse principale';" },
  /* Le verdict et la notification. */
  { nom: 'la journee se dit close avec des rendez-vous ouverts', fichier: P, avant: 'const close = reste.length === 0;', apres: 'const close = alarmesOuvertes === 0;' },
  { nom: 'la notification dit un nom', fichier: P, avant: "return { titre, corps: `${[...c.verdict.reste, ...aDire].join(', ')}.`.replace(/^./, (x) => x.toUpperCase()) };", apres: "return { titre, corps: `${[...c.verdict.reste, ...aDire].join(', ')} (A. K. M.).`.replace(/^./, (x) => x.toUpperCase()) };" },
  { nom: 'les initiales deviennent le nom', fichier: P, avant: ".map((p) => `${p.charAt(0).toUpperCase()}.`).join('-')", apres: '.join(\'-\')' },
  { nom: 'la Maison fermee se suppose (dimanche et lundi en dur)', fichier: P, avant: 'if (!j || j.closed) return true;', apres: 'if (!j || dow === 0 || dow === 1) return true;' },
  { nom: 'une heure de cloture hors bornes passe', fichier: P, avant: 'h >= 8 && h <= 23', apres: 'h >= 0 && h <= 24' },
  /* Les depenses du jour (5 novembre 2026) : Grenat relit, il ne saisit jamais. */
  { nom: 'la depense a valider du jour ne retient pas le comptage', fichier: P, avant: 'if (depenses.comptes.aValiderDuJour) reste.push(', apres: 'if (false) reste.push(' },
  { nom: 'une depense a completer retient la journee', fichier: P, avant: 'if (depenses.comptes.aValiderDuJour) reste.push(nombreDit(depenses.comptes.aValiderDuJour,', apres: 'if (depenses.comptes.aValiderDuJour + depenses.comptes.aCompleter) reste.push(nombreDit(depenses.comptes.aValiderDuJour + depenses.comptes.aCompleter,' },
  { nom: 'une depense a valider d un autre jour retient le comptage', fichier: P, avant: 'if (duJour) comptes.aValiderDuJour += 1; else comptes.aValiderAvant += 1;', apres: 'comptes.aValiderDuJour += 1;' },
  { nom: 'la recurrente compte comme saisie du jour', fichier: P, avant: '  !e.recurring && !e.source && !e.empruntId;', apres: '  !e.source && !e.empruntId;' },
  { nom: 'la charge de la paie compte comme saisie du jour', fichier: P, avant: '  !e.recurring && !e.source && !e.empruntId;', apres: '  !e.recurring && !e.empruntId;' },
  { nom: 'la photo du recu se reclame sous le seuil du justificatif', fichier: P, avant: "if (!e.fichier && montantDeLaDepense(e) >= SEUIL_DE_LA_PHOTO_XOF) manque.push('recu');", apres: "if (!e.fichier) manque.push('recu');" },
  { nom: '« La Maison elle-meme » ne vaut pas reponse', fichier: P, avant: "if (!String(e.porteur ?? '').trim() && !e.laMaisonAPaye) manque.push('porteur');", apres: "if (!String(e.porteur ?? '').trim()) manque.push('porteur');" },
  { nom: 'le jour sans depense se demande avant la relecture', fichier: P, avant: 'const relues = o.minutesMaintenant >= heure * 60;', apres: 'const relues = true;' },
  { nom: 'l heure reglee de la relecture est ignoree', fichier: P, avant: 'const heure = Number.isInteger(o.heureDesDepenses) ? Number(o.heureDesDepenses) : 19;', apres: 'const heure = 19;' },
  { nom: 'un jour ferme demande ses depenses', fichier: P, avant: 'if (relues && !o.ferme && saisies.length === 0 && !o.tranche.has(cleSans)) {', apres: 'if (relues && saisies.length === 0 && !o.tranche.has(cleSans)) {' },
  { nom: '« Rien aujourd hui » ne ferme rien', fichier: P, avant: 'if (relues && !o.ferme && saisies.length === 0 && !o.tranche.has(cleSans)) {', apres: 'if (relues && !o.ferme && saisies.length === 0) {' },
  { nom: 'sans depenses lues, Grenat croit a un jour sans depense', fichier: P, avant: 'if (!o.depenses) return { lues: false,', apres: 'if (!o.depenses) o = { ...o, depenses: [] }; if (false) return { lues: false,' },
  { nom: 'une depense refusee reste a valider', fichier: P, avant: "deLaMaison(e.branchId) && e.validation?.etat !== 'refusee');", apres: 'deLaMaison(e.branchId));' },
  { nom: 'une depense d une autre maison compte ici', fichier: P, avant: 'const deLaMaison = (b?: string) => !o.branchId || !b || b === o.branchId;', apres: 'const deLaMaison = (b?: string) => true || b;' },
  { nom: 'l ecart deja explique au comptage revient', fichier: P, avant: 'if (c.depenses?.length || c.validation) continue;', apres: 'if (c.validation) continue;' },
  { nom: 'l ecart accepte par la direction revient', fichier: P, avant: 'if (c.depenses?.length || c.validation) continue;', apres: 'if (c.depenses?.length) continue;' },
  { nom: 'un recomptage ne remplace pas l ecart', fichier: P, avant: 'if ((o.comptages ?? []).some((x) => x.reprend === c.id)) continue;', apres: '' },
  { nom: 'la depense ecrite pour l ecart ne le ferme pas', fichier: P, avant: 'if (vivantes.some((e) => e.ecartDe === c.id)) continue;', apres: '' },
  { nom: '« Laisser l ecart » ne ferme rien', fichier: P, avant: 'if (o.tranche.has(cleDeLEcart(c.id))) continue;', apres: '' },
  { nom: 'un ecart en trop reclame une depense', fichier: P, avant: 'if (ecart >= 0) continue;', apres: 'if (ecart === 0) continue;' },
  { nom: 'l ecart d un autre jour revient', fichier: P, avant: '(o.comptages ?? []).filter((c) => deLaMaison(c.branchId) && c.date === o.jour);', apres: '(o.comptages ?? []).filter((c) => deLaMaison(c.branchId));' },
  { nom: 'la notification de 19 h tait les depenses', fichier: P, avant: 'const aDire = c.depenses?.aDire ?? [];', apres: 'const aDire: string[] = [];' },
  { nom: 'les nombres des depenses partent a 15 h', fichier: P, avant: 'const aDire = relues ? [', apres: 'const aDire = true ? [' },
  { nom: 'le montant d une depense oublie ses articles', fichier: P, avant: 'e.items && e.items.length ? e.items.reduce((s, it) => s + (Number(it.amountXof) || 0), 0) : Number(e.amountXof) || 0;', apres: 'Number(e.amountXof) || 0;' },
  { nom: 'la date dite perd son annee', fichier: P, avant: '${MOIS_DITS[Number(m[2]) - 1]} ${m[1]}`;', apres: '${MOIS_DITS[Number(m[2]) - 1]}`;' },
  { nom: 'la fonction ecrit une depense', fichier: FN, avant: "sb.from('expenses').select('id, branch_id, data').eq('data->>date', jour)", apres: "sb.from('expenses').upsert({ id: 'x' }).select('id, branch_id, data').eq('data->>date', jour)", disque: true },
  { nom: 'la fonction ne lit plus les depenses qui attendent', fichier: FN, avant: ".eq('data->validation->>etat', 'attente')", apres: ".eq('data->validation->>etat', 'validee')", disque: true },
  { nom: 'la fonction ne lit plus les comptages de tiroir', fichier: FN, avant: "sb.from('clotures_caisse')", apres: "sb.from('pointages')", disque: true },
  { nom: 'la fonction ne passe pas les depenses a la regle', fichier: FN, avant: 'envois, depenses, comptages, heureDesDepenses });', apres: 'envois });', disque: true },
  { nom: 'Valider ouvert a tous dans La journee', fichier: LJ, avant: 'return !!e && peutValider(me?.role, monNom, e); }', apres: 'return !!e; }', disque: true },
  { nom: '« Rien aujourd hui » ouvert a tous', fichier: LJ, avant: "if (g === 'rien-aujourdhui' || g === 'laisser-l-ecart') return souverain;", apres: "if (g === 'rien-aujourdhui' || g === 'laisser-l-ecart') return true;", disque: true },
  { nom: 'les depenses quittent La journee', fichier: LJ, avant: 'data-lj="depenses"', apres: 'data-lj="ailleurs"', disque: true },
  { nom: 'un tiret « — » dans un texte neuf', fichier: LJ, avant: "'Aucune dépense ce jour-là, et rien à redire.'", apres: "'Aucune dépense ce jour-là — et rien à redire.'", disque: true },
  { nom: 'le Trone juge sans les depenses', fichier: PRISE, avant: 'depenses: depenses as unknown as DepenseLue[],', apres: '', disque: true },
  { nom: 'decideLaDepense sans la validation de toujours', fichier: PARTAGE, avant: 'if (!peutValider(o.role, o.nom, e)) {', apres: 'if (false) {', disque: true },
  { nom: 'un refus sans motif passe', fichier: PARTAGE, avant: "if (!o.oui && !motif) return 'Un refus se donne avec son motif.';", apres: '', disque: true },
  { nom: 'la veille a valider tait les depenses', fichier: VEILLE, avant: 'const depensesDites = grenat?.cloture.depenses?.aDire ?? [];', apres: 'const depensesDites: string[] = [];', disque: true },
  { nom: 'Depenses n ecrit plus le lien de l ecart', fichier: DEP, avant: '...(form.ecartDe ? { ecartDe: form.ecartDe } : {}),', apres: '', disque: true },
  { nom: 'Depenses n ecrit plus « La Maison elle-meme »', fichier: DEP, avant: 'const laMaisonAPaye = voitToutesLesDepenses && form.porteurChoisi && !form.porteur.trim();', apres: 'const laMaisonAPaye = false;', disque: true },
  /* La copie, la fonction, la migration. */
  { nom: 'un caractere change dans la copie de la fonction', fichier: FN, avant: "export const VERSION_DE_LA_CLOTURE = '2026-11-05-a';", apres: "export const VERSION_DE_LA_CLOTURE = '2026-11-05-b';", disque: true },
  { nom: 'le maitre qui a pose un rendez-vous est prevenu', fichier: FN, avant: ".eq('table_name', 'invoices').eq('porte', 'trone')", apres: ".in('table_name', ['invoices', 'appointments']).eq('porte', 'trone')", disque: true },
  { nom: 'la porte de secours ouverte a toute l equipe', fichier: 'src/apps/trone/routes/finances/Caisses.tsx', avant: '{estDirection && (', apres: '{(true) && (', disque: true },
  { nom: 'la fonction ecrit sans relire', fichier: FN, avant: 'if (!gesteToujoursValable(', apres: 'if (false && !gesteToujoursValable(', disque: true },
  { nom: 'la fonction ecrit sans condition', fichier: FN, avant: ".eq('id', frais.id).eq('updated_at', frais.updated_at).select('id');", apres: ".eq('id', frais.id).select('id');", disque: true },
  { nom: 'le mot du matin envoie le papier d hier', fichier: FN, avant: "if (matin && g.genre === 'envoyer-le-papier')", apres: "if (false && g.genre === 'envoyer-le-papier')", disque: true },
  { nom: 'la fonction notifie a chaque relance', fichier: FN, avant: 'if (!essai && !matin && !dejaDit && pourLaNotification) {', apres: 'if (!essai && !matin && pourLaNotification) {', disque: true },
  { nom: 'la fonction travaille a toute heure', fichier: FN, avant: 'if (!matin && !essai && !heures.includes(ici.heure)) {', apres: 'if (false) {', disque: true },
  { nom: 'la fonction ne lit plus les pieces effacees', fichier: FN, avant: ".eq('operation', 'efface')", apres: ".eq('operation', 'modifie')", disque: true },
  { nom: '0156 : le compte rendu sans RLS', fichier: SQL, avant: 'alter table public.clotures_de_grenat enable row level security;', apres: '', disque: true },
  { nom: '0156 : plus de garde des pieces payees', fichier: SQL, avant: 'before delete on public.invoices', apres: 'before update on public.invoices', disque: true },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-cloture-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    let cwd = racine;
    /* Une panne « disque » : le harnais lit le fichier, il ne l'importe pas. On
       monte un depot fantome ou ce seul fichier est change, les autres lus du
       vrai depot par des chemins absolus. */
    if (panne?.disque) {
      cwd = path.join(dossier, 'depot');
      const ecris = (rel, texte) => {
        const cible = path.join(cwd, rel);
        spawnSync(process.execPath, ['-e', `require('fs').mkdirSync(${JSON.stringify(path.dirname(cible))}, { recursive: true })`]);
        writeFileSync(cible, texte);
      };
      for (const rel of LUS) {
        const texte = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
        ecris(rel, rel === panne.fichier ? texte.split(panne.avant).join(panne.apres) : texte);
      }
      /* Le harnais liste les migrations : seule 0156 compte, elle est copiee. */
    }
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-cloture-du-jour.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      /* Les originaux confrontes (settings, finance) tirent le magasin : un
         stockage en memoire lui suffit, rien n'est ecrit nulle part. */
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
      plugins: panne && !panne.disque ? [{
        name: 'panne',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== panne.fichier) return undefined;
            const contents = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').split(panne.avant).join(panne.apres);
            return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) };
          });
        },
      }] : [],
    });
    return spawnSync(process.execPath, [sortie], { cwd, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
};

const prouve = process.argv.includes('--prouve');
const net = await lance(null);
process.stdout.write(net.stdout ?? '');
if (net.status !== 0) { process.stderr.write(net.stderr ?? ''); process.exit(1); }
if (prouve) {
  let muettes = 0;
  for (const p of PANNES) {
    const texte = readFileSync(path.join(racine, p.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(p.avant).length - 1;
    const avant = md5(p.fichier);
    let verdict;
    if (fois < 1 || (fois !== 1 && !p.disque)) verdict = `INTROUVABLE (${fois} fois)`;
    else {
      const r = await lance(p);
      verdict = r.status !== 0 ? 'CRIE ' : 'MUETTE';
    }
    if (md5(p.fichier) !== avant) verdict = `LE FICHIER A CHANGE (${verdict})`;
    if (verdict !== 'CRIE ') muettes++;
    console.log(`${verdict} ${p.nom}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) ou introuvable(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
