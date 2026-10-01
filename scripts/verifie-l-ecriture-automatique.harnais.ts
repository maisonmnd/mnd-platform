/* UN AUTOMATISME QUI S'EMBALLE SE TAIT, EPROUVE — `node scripts/verifie-l-ecriture-automatique.mjs`.

   Le 1er octobre 2026, les fiches clientes se reecrivaient en boucle : la
   pastille restait sur « Synchronisation… · clients », et la fenetre d'un
   rendez-vous ne repondait plus. La regle : un automatisme ecrit quand il a
   quelque chose a dire, pas en continu. Ce harnais tient la regle avec une
   horloge qu'il mene lui-meme, et verifie que chaque automatisme du Trone
   passe bien par elle. */
import { readFileSync, readdirSync } from 'node:fs';
import {
  peutEcrireSeul, automatismesEnPause, gardeLEcriture, oublieLesPassages,
  PASSAGES_AU_PLUS, PAUSE_MS, FENETRE_MS, MEME_PASSAGE_MS,
} from '../src/shared/ecriture-automatique';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const SECONDE = 1000;

/* ── 1. Un automatisme sage n'est jamais gene ── */
oublieLesPassages();
{
  let t = 1_000_000;
  const droits: boolean[] = [];
  for (let i = 0; i < 30; i += 1) { droits.push(peutEcrireSeul('passage', t)); t += 20 * SECONDE; }
  dit('un passage toutes les vingt secondes, trente fois : toujours permis', 30, droits.filter(Boolean).length);
  dit('... et rien n est en pause', [], automatismesEnPause(t));
}

/* ── 2. La boucle : un passage par seconde ── */
oublieLesPassages();
{
  let t = 2_000_000;
  const droits: boolean[] = [];
  for (let i = 0; i < 20; i += 1) { droits.push(peutEcrireSeul('fiches', t)); t += SECONDE; }
  dit(`une boucle a un passage par seconde s arrete apres ${PASSAGES_AU_PLUS} ecritures`, PASSAGES_AU_PLUS, droits.filter(Boolean).length);
  dit('... les suivantes sont refusees', false, droits[PASSAGES_AU_PLUS]);
  dit('... et l automatisme est dit en pause', ['fiches'], automatismesEnPause(t));
  dit('... un AUTRE automatisme, lui, ecrit toujours', true, peutEcrireSeul('persona', t));
  dit('... dix minutes plus tard, toujours en pause', false, peutEcrireSeul('fiches', t + 10 * 60 * SECONDE));
  const apres = t + PAUSE_MS + SECONDE;
  dit('... passe le quart d heure, il reprend', true, peutEcrireSeul('fiches', apres));
  dit('... et n est plus dit en pause', false, automatismesEnPause(apres).includes('fiches'));
}

/* ── 3. Cinq champs poses d'un seul passage comptent pour UN ── */
oublieLesPassages();
{
  let t = 3_000_000;
  let permis = 0;
  for (let passage = 0; passage < PASSAGES_AU_PLUS; passage += 1) {
    for (let champ = 0; champ < 5; champ += 1) { if (peutEcrireSeul('parrainage', t + champ)) permis += 1; }
    t += 5 * SECONDE;
  }
  dit('six passages de cinq ecritures chacun : les trente passent', 30, permis);
  dit('... sans mise en pause', [], automatismesEnPause(t));
  dit('la fenetre d un meme passage est plus courte qu une seconde', true, MEME_PASSAGE_MS < SECONDE);
}

/* ── 4. La fenetre glisse : six passages etales sur plus d'une minute ne declenchent rien ── */
oublieLesPassages();
{
  let t = 4_000_000;
  let permis = 0;
  for (let i = 0; i < 12; i += 1) { if (peutEcrireSeul('reservations', t)) permis += 1; t += FENETRE_MS / 5; }
  dit('douze passages a douze secondes d ecart : tous permis', 12, permis);
}

/* ── 5. Le magasin garde : l'ecriture passe, puis se tait ── */
oublieLesPassages();
{
  let ecritures = 0;
  const magasin = { get: () => 0, set: (_v: number) => { ecritures += 1; } };
  const garde = gardeLEcriture('essai', magasin);
  const vrai = Date.now;
  let t = 5_000_000;
  Date.now = () => t;
  try {
    for (let i = 0; i < 20; i += 1) { garde.set(i); t += SECONDE; }
  } finally {
    Date.now = vrai;
  }
  dit('un magasin garde ne recoit que les ecritures permises', PASSAGES_AU_PLUS, ecritures);
}

/* ── 6. Chaque automatisme du Trone passe par la regle ── */
{
  const dossier = 'src/apps/trone/shell';
  const automatismes = readdirSync(dossier).filter((f) => /^use.*(Vivant|ReconcileClients|RattacheLesReservations|FormulesRapides)\.tsx?$/.test(f));
  dit('les automatismes sont bien la', true, automatismes.length >= 7);
  const nus: string[] = [];
  for (const f of automatismes) {
    /* Les commentaires s'effacent avant de scanner. */
    const source = readFileSync(`${dossier}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const ecritures = source.match(/[a-zA-Z]+Store\.set\(/g) ?? [];
    const gardees = source.match(/gardeLEcriture\('[^']+', [a-zA-Z]+Store\)\.set\(/g) ?? [];
    if (ecritures.length > 0) nus.push(`${f} : ${ecritures.length} ecriture(s) nue(s)`);
    if (gardees.length === 0) nus.push(`${f} : aucune ecriture gardee`);
  }
  dit('aucun automatisme n ecrit dans un magasin sans passer par la regle', [], nus);
}

console.log(ko === 0 ? '\nLes automatismes tiennent leur langue.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
