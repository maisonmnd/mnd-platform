/* LA CONSULTATION DIT CE QU'ELLE FAIT — 14 octobre 2026.

   La Consultation (15 000 F) annonçait « l'intelligence de la Maison lit votre
   couronne » et animait « Lecture des images… », alors que les photos ne
   quittaient jamais le téléphone : le dépôt n'en envoie que les libellés, et
   `computeDiag` ne lit que le questionnaire. Yéman a choisi de corriger le
   texte en attendant le diagnostic par photo.

   LA RÈGLE, PAS LE CAS DU JOUR : tant que la Consultation n'envoie pas les
   images (aucun dépôt de fichier vers le stockage), aucune phrase montrée à
   la cliente ne peut dire qu'une machine lit, mesure ou cartographie sa
   couronne, ni afficher une densité qu'aucune réponse ne mesure. Le jour où
   les photos partiront vraiment, ce banc se relâche de lui-même et le texte
   pourra changer avec le diagnostic.

   Sortie ASCII (console Windows). Les commentaires sont effacés avant la
   lecture : une note qui cite l'ancienne phrase n'est pas un texte montré. */
import { readFileSync } from 'node:fs';

const lis = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

const app = sansCommentaires(lis('src/apps/consultation/App.tsx'));
const data = sansCommentaires(lis('src/apps/consultation/data.ts'));
const montre = `${app}\n${data}`;

let ko = 0;
const dit = (nom, ok, detail = '') => {
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok || !detail ? '' : `\n       ${detail}`}`);
};

/* Les photos partent-elles ? Un dépôt vers le stockage Supabase. Aujourd'hui : non. */
const photosEnvoyees = /\.storage\s*\.\s*from\(/.test(app);
console.log(photosEnvoyees ? 'Les photos partent vers le stockage : la regle se releve.' : 'Les photos restent sur le telephone : la regle s applique.');

if (!photosEnvoyees) {
  const interdits = [
    [/intelligence/i, 'une « intelligence » qui lirait'],
    [/lecture des images/i, '« Lecture des images »'],
    [/lit votre couronne/i, '« lit votre couronne »'],
    [/cartographie/i, 'une cartographie du cuir chevelu'],
    [/\bmesure\b/i, 'une mesure'],
    [/observe la densit/i, 'une observation de la densite'],
    [/lit la sant/i, 'une lecture de la sante du cuir chevelu'],
    [/Ce que lit la Maison/, '« Ce que lit la Maison »'],
  ];
  for (const [motif, quoi] of interdits) {
    const m = montre.match(motif);
    dit(`aucun texte ne promet ${quoi.normalize('NFD').replace(/[^ -~]/g, '').replace(/\s+/g, ' ')}`, !m, m ? `trouve : ${JSON.stringify(m[0]).normalize('NFD').replace(/[^\x20-\x7e]/g, '')}` : '');
  }
  dit('la densite ne s affiche pas : aucune reponse ne la mesure', !/\['Densit[^']*', diag\.scores\.densite\]/.test(app));
  dit('l etape des photos dit qu elles restent sur le telephone', /restent sur votre t[ée]l[ée]phone/.test(app));
  dit('le diagnostic dit qu il vient des reponses', /d[’']apr[èe]s vos r[ée]ponses/.test(app));
}

console.log(ko ? `\n${ko} controle(s) en echec.` : '\nLa Consultation dit ce qu elle fait.');
process.exit(ko ? 1 : 0);
