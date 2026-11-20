import { readFileSync } from 'node:fs';
import path from 'node:path';

/* LE CADEAU D'ANNIVERSAIRE, LOIN D'« ENREGISTRER » — `node scripts/verifie-le-cadeau-anniversaire.mjs`.

   20 novembre 2026 : « je voulais mettre à jour le profil […] au lieu
   d'Enregistrer ses coordonnées, j'ai appuyé Offrir une séance
   d'anniversaire. Ces deux boutons-là sont trop proches » (Yéman).

   Le cadeau vit dans la LECTURE de « La joindre », jamais dans le
   formulaire où se trouve « Enregistrer ses coordonnées » : les deux ne sont
   donc jamais à l'écran ensemble. Offrir, renvoyer et retirer se confirment. */

const racine = path.resolve(import.meta.dirname, '..');
const fiche = readFileSync(path.join(racine, 'src/apps/trone/routes/clients/Customers.tsx'), 'utf8');

let ko = 0;
const dit = (nom, ok) => {
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom}`);
};

const debutLecture = fiche.indexOf("{panEdite !== 'joindre' && (");
const debutForm = fiche.indexOf("{panEdite === 'joindre' && (<>");
const finForm = fiche.indexOf('</>)}', debutForm);
const lecture = debutLecture >= 0 && debutForm > debutLecture ? fiche.slice(debutLecture, debutForm) : '';
/* Les commentaires ne comptent pas : ils citent la phrase de Yéman. */
const formulaire = (debutForm >= 0 && finForm > debutForm ? fiche.slice(debutForm, finForm) : '').replace(/\/\*[\s\S]*?\*\//g, '');

dit('la lecture et le formulaire de « La joindre » se retrouvent', lecture.length > 0 && formulaire.length > 0);
dit('« Enregistrer ses coordonnées » est dans le formulaire', /Enregistrer ses coordonnées/.test(formulaire));
dit('le formulaire n’offre aucun cadeau', !/giftBirthday|retirerLeCadeau|Offrir une séance/.test(formulaire));
dit('le cadeau est dans la lecture, sous l’anniversaire', /<u>Anniv\.<\/u>[\s\S]*<u>Son cadeau<\/u>[\s\S]*giftBirthday\(\)/.test(lecture));
dit('le geste inverse est là : Retirer', /onClick=\{\(\) => void retirerLeCadeau\(\)\}/.test(lecture));

const corps = (nom) => {
  const i = fiche.indexOf(`const ${nom} = async () => {`);
  return i < 0 ? '' : fiche.slice(i, fiche.indexOf('\n  };', i));
};
const offrir = corps('giftBirthday');
const retirer = corps('retirerLeCadeau');
dit('offrir se confirme AVANT de pousser la notification',
  offrir.indexOf('await demande(') >= 0 && offrir.indexOf('await demande(') < offrir.indexOf('pushToClient('));
dit('offrir se tait si on refuse', /if \(!await demande\([\s\S]*?\}\)\) return;/.test(offrir));
dit('retirer se confirme, puis efface la marque seulement',
  retirer.indexOf('await demande(') >= 0 && retirer.indexOf('await demande(') < retirer.indexOf('patch({ birthdayGiftAt: undefined })'));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} épreuve(s) en échec.`);
