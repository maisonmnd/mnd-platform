import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES FICHES D'ESSAI, EPROUVEES - 7 novembre 2026 (sur le modele de verifie-a-traiter).
   `node scripts/verifie-essai.mjs` : le banc, dans un processus fils (le paquet
   s'ecrit sous node_modules/.cache et s'efface dans un finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc doit
   crier a chacune. `--prouve --seulement=mot,mot` : les seules fautes dont le
   nom porte l'un des mots. Les fautes sont de deux familles : la regle pure
   faussee, et un ecran de comptes qui relit le registre entier (un total qui se
   salit), ou la chaine d'essai qui perd ses rendez-vous (l'essai qui ne marche
   plus). */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-essai');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-essai.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' }, setInterval() { return 0; }, clearInterval() {} };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/essai-pur.ts';
const PORTES = 'src/shared/essai.ts';
const T = 'src/apps/trone/';
const PANNES = [
  ['toute fiche est d essai', PUR, 'client?.essai === true', '!!client'],
  ['aucune fiche n est d essai', PUR, 'client?.essai === true', 'false'],
  ['le service des essais oublie', PUR, 'if (appt.serviceIds?.includes(SERVICE_D_ESSAI_ID)) return true;', ''],
  ['le service des essais rend tout d essai', PUR, 'if (appt.serviceIds?.includes(SERVICE_D_ESSAI_ID)) return true;', 'if (appt.serviceIds?.length) return true;'],
  ['le rendez-vous ne se juge plus sur sa cliente', PUR, 'return !!appt.clientId && estUneFicheDEssai(clientsParId.get(appt.clientId));', 'return false;'],
  ['la piece ne se juge plus sur sa cliente', PUR, 'if (piece.clientId && estUneFicheDEssai(clientsParId.get(piece.clientId))) return true;', ''],
  ['la piece ne se juge plus sur son rendez-vous', PUR, 'return !!lie && estUnRdvDEssai(lie, clientsParId);', 'return false;'],
  ['le selecteur garde les essais', PUR, 'rdvs.filter((a) => !estUnRdvDEssai(a, clientsParId))', 'rdvs.filter((a) => estUnRdvDEssai(a, clientsParId))'],
  ['les pieces gardent les essais', PUR, 'pieces.filter((p) => !estUnePieceDEssai(p, clientsParId, liens))', 'pieces.filter((p) => estUnePieceDEssai(p, clientsParId, liens))'],
  ['le calendrier montre les essais par defaut', PUR, '(montrerLesEssais ? [...rdvs] : sansLesEssais(rdvs, clientsParId))', '(!montrerLesEssais ? [...rdvs] : sansLesEssais(rdvs, clientsParId))'],
  ['l interrupteur ne montre rien', PUR, '(montrerLesEssais ? [...rdvs] : sansLesEssais(rdvs, clientsParId))', 'sansLesEssais(rdvs, clientsParId)'],
  ['les statistiques gardent les fiches d essai', PUR, 'clients.filter((c) => !estUneFicheDEssai(c))', 'clients.filter((c) => estUneFicheDEssai(c) || true)'],
  ['la requete des assistants fausse', PUR, "\"not coalesce((c.data->>'essai')::boolean, false)\"", "\"coalesce((c.data->>'essai')::boolean, false)\""],
  ['un tiret long dans la case', PUR, "export const MONTRER_LES_ESSAIS = 'Montrer les essais';", "export const MONTRER_LES_ESSAIS = 'Montrer — les essais';"],
  ['la porte des rendez-vous ne filtre plus', PORTES, 'sansLesEssais(appointmentsStore.get(), fichesParId(clientsStore.get()))', 'appointmentsStore.get()'],
  ['la porte des pieces oublie les rendez-vous lies', PORTES, 'piecesSansLesEssais(invoicesStore.get(), fichesParId(clientsStore.get()), appointmentsStore.get())', 'piecesSansLesEssais(invoicesStore.get(), fichesParId(clientsStore.get()))'],
  ['la porte des paiements laisse passer le versement d essai', PORTES, 'return !(r && estUnRdvDEssai(r, parId));', 'return true;'],
  ['useBranchAppointments relit tout', T + 'routes/clients/_shared.tsx', 'const [appointments] = useRdvsDeLaMaison();', 'const [appointments] = useAppointments();'],
  ['la Synthese relit les pieces entieres', T + 'routes/finances/Synthese.tsx', 'usePiecesDeLaMaison()', 'useInvoices()'],
  ['le chiffre des prestations relit les rendez-vous entiers', T + 'routes/finances/ChiffreDesPrestations.tsx', 'useRdvsDeLaMaison()', 'useAppointments()'],
  ['le revenu du jour relit les pieces entieres', T + 'routes/finances/RevenuDuJour.tsx', 'usePiecesDeLaMaison()', 'useInvoices()'],
  ['la cloture cote Trone relit les pieces entieres', T + 'routes/finances/useClotureDuJour.ts', 'usePiecesDeLaMaison()', 'useInvoices()'],
  ['le tableau de bord relit les pieces entieres', T + 'routes/pilotage/Dashboard.tsx', 'usePiecesDeLaMaison()', 'useInvoices()'],
  ['le bilan mensuel relit les rendez-vous entiers', T + 'routes/pilotage/BilanMensuel.tsx', 'useRdvsDeLaMaison()', 'useAppointments()'],
  ['le Carnet relit les pieces entieres', T + 'routes/clients/Carnet.tsx', 'usePiecesDeLaMaison()', 'useInvoices()'],
  ['les factures relisent les pieces entieres', T + 'routes/vente/Factures.tsx', 'usePiecesDeLaMaison()', 'useInvoices()'],
  ['les caisses relisent les pieces entieres', T + 'routes/finances/Caisses.tsx', 'usePiecesDeLaMaison()', 'useInvoices()'],
  ['la paie relit les pieces entieres', T + 'routes/equipe/Paie.tsx', 'usePiecesDeLaMaison()', 'useInvoices()'],
  ['les notifications de l equipe relisent les rendez-vous entiers', T + 'shell/Notifications.tsx', 'useRdvsDeLaMaison()', 'useAppointments()'],
  ['le Cercle compte les fiches d essai', T + 'routes/equipe/Cercle.tsx', 'useClientsDeLaMaison()', 'useClients()'],
  ['le calendrier juge les chevauchements sur ce qu il montre', T + 'routes/clients/Calendrier.tsx', 'return tousLesRdv.some((a) => {', 'return appts.some((a) => {'],
  ['le calendrier montre toujours les essais', T + 'routes/clients/Calendrier.tsx', 'rdvsDuCalendrier(tousLesRdv, fichesDuCalendrier, montrerLesEssais)', 'rdvsDuCalendrier(tousLesRdv, fichesDuCalendrier, true)'],
  ['la fiche montre la case a tout le monde', T + 'routes/clients/Customers.tsx', '{estDirection && (\n                <Field label="Fiche d’essai">', '{(\n                <Field label="Fiche d’essai">'],
  ['le badge disparait du nom de la fiche', T + 'routes/clients/Customers.tsx', '{client.name}{estUneFicheDEssai(client) && <BadgeEssai />}', '{client.name}'],
  ['la fin du rituel ne voit plus le rendez-vous d essai (chaine cassee)', T + 'shell/useLaFinDuRituel.ts', 'useAppointments()', 'useRdvsDeLaMaison()'],
  ['le reglement en ligne ne voit plus le rendez-vous d essai (chaine cassee)', T + 'shell/useReglementsEnLigne.ts', 'useAppointments()', 'useRdvsDeLaMaison()'],
  ['les conversations perdent le badge', T + 'routes/clients/LesConversations.tsx', '<b>{b.nom}</b>{b.clientId && estUneFicheDEssai(clients.find((c) => c.id === b.clientId)) && <BadgeEssai />}\n              {recu', '<b>{b.nom}</b>\n              {recu'],
  ['la cloture de Grenat compte les rendez-vous d essai', 'supabase/functions/cloture-du-jour/index.ts', 'lignesRdv = lignesRdv.filter((l) => !idsRdvEssai.has(String(l.id)));', ''],
  ['la cloture de Grenat compte les pieces d essai', 'supabase/functions/cloture-du-jour/index.ts', "if (fichesDEssai.has(String(l.data?.clientId ?? '')) || idsRdvEssai.has(String(l.data?.apptId ?? ''))) pieces.delete(id);", ''],
  ['le centre de commande compte le service des essais', 'supabase/functions/centre-de-commande/index.ts', '.filter((r: Rdv) => !(r.serviceIds ?? []).includes(SERVICE_D_ESSAI))', ''],
  ['la page du matin compte les rendez-vous d essai', 'supabase/functions/conseil-du-matin/index.ts', '.filter((r) => !rdvDEssai(r.data, essais)).map((r) => ({ time', '.map((r) => ({ time'],
  ['le plan du lancement lit la liste entiere', T + 'routes/equipe/lancement.ts', 'rdvsDesLunes(rdvsDeLaMaison())', 'rdvsDesLunes(appointmentsStore.get())'],
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
  const seulement = (process.argv.find((a) => a.startsWith('--seulement=')) || '').slice(12).split(',').filter(Boolean);
  let muettes = 0;
  let jouees = 0;
  try {
    for (const [nom, fichier, a, b] of PANNES) {
      if (seulement.length && !seulement.some((m) => nom.includes(m))) continue;
      jouees++;
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, () => b);
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
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${jouees} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exitCode = muettes === 0 && intacts ? 0 : 1;
}
