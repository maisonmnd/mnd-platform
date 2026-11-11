/* LES FICHES DE SOIN, ÉPROUVÉES — `node scripts/verifie-les-fiches-de-soin.mjs` (et `--prouve`).
   11 novembre 2026 : les PDF d'une cliente dans le coffre privé, sous
   `<clientId>/fiches/`, listés en tête de l'onglet Documents. */
import { readFileSync } from 'node:fs';
import { dossierDesFiches, estUneFiche, ficheLue, nomDeLaFiche } from '../src/shared/fiches-de-soin-pur';

let ko = 0; let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++; const ok = JSON.stringify(attendu) === JSON.stringify(obtenu); if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

dit('le dossier : <clientId>/fiches, rien d autre ne passe', ['MND-AB12/fiches', 'abc/fiches', 'x/fiches'],
  [dossierDesFiches('MND-AB12'), dossierDesFiches('a/b..c'), dossierDesFiches('')]);
dit('le nom : sans accent ni point median, toujours .pdf', [
  '1 - Programme cuir chevelu (a remettre a la cliente).pdf', 'Huiles et beurres, a prendre et a eviter (interne).pdf', 'Fiche.pdf'],
  [nomDeLaFiche('1 · Programme cuir chevelu (à remettre à la cliente).pdf'), nomDeLaFiche('Huiles et beurres, à prendre et à éviter (interne)'), nomDeLaFiche('  ')]);
dit('la lecture : le titre sans numero, a qui', [
  { titre: 'Programme cuir chevelu (a remettre a la cliente)', pourLaCliente: true, interne: false },
  { titre: 'Fiche equipe cuir chevelu (interne)', pourLaCliente: false, interne: true }],
  [ficheLue('1 - Programme cuir chevelu (a remettre a la cliente).pdf'), ficheLue('2 - Fiche equipe cuir chevelu (interne).pdf')]);
dit('seuls les PDF sont des fiches', [true, false], [estUneFiche('a.PDF'), estUneFiche('.emptyFolderPlaceholder')]);

const sql = lis('supabase/migrations/0199_les_fiches_de_soin_en_pdf.sql');
dit('0199 : le coffre prend le PDF, sans s ouvrir au public ni toucher aux droits', [true, false, false],
  [sql.includes("array['application/pdf']"), /public\s*=\s*true/.test(sql), /create policy|drop policy/.test(sql)]);
const comp = lis('src/apps/trone/routes/clients/FichesDeSoin.tsx');
dit('le Trone : adresse signee d une heure, jamais d ecrasement, PDF seulement', [true, true, true],
  [comp.includes('createSignedUrl(`${dossier}/${nom}`, 3600)'), comp.includes("contentType: 'application/pdf', upsert: false"), comp.includes("refus('Seul un PDF se range ici.')")]);
const fiche = lis('src/apps/trone/routes/clients/Customers.tsx');
dit('la fiche : en tete de l onglet Documents', true,
  /\{tab === 'docs' && \(\n\s*<div className="trc-docs-onglet">\n[^\n]*\n\s*<FichesDeSoin clientId=\{client\.id\} \/>/.test(fiche));

console.log(`\n${ko ? `${ko} echec(s) sur ${n}.` : `Tout tient (${n} controles).`}`);
process.exitCode = ko ? 1 : 0;
