/* LE PARENT QUI A PRIS LE RENDEZ-VOUS, EPROUVE — 27 octobre 2026.
   `node scripts/verifie-le-numero-a-prevenir.mjs` (et `--prouve`).

   « La personne qui a pris le RDV recoit la confirmation et le rappel ; la
   facture va sur le numero du parent payant » (Yeman). La regle :
   src/shared/numero-a-prevenir-pur.ts ; recopiee dans les fonctions
   confirmation-rdv et rappels-j1. Tout est invente, TOUS LES ATTENDUS SONT
   ECRITS A LA MAIN. Sortie ASCII. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { numerosDeLaFiche, numeroAPrevenirDuRdv, telDuRdv } from '../src/shared/numero-a-prevenir-pur';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (n: number, nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 200)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 200)}`));
};
const brut = (rel: string): string => {
  let s = readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return s;
};
const source = (rel: string): string => brut(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const ENFANT = { phone: '0151000001', phone2: '0197000002', phoneNom: 'Maman', phone2Nom: 'Papa' };

/* == #1 -- LES NUMEROS DE LA FICHE, avec leur nom == */
dit(1, 'deux numeros nommes ; sans nom : Numero 1 et 2 ; le meme numero deux fois n en fait qu un ; un seul : un seul', [
  [['0151000001', 'Maman'], ['0197000002', 'Papa']],
  [['0151000001', 'Numéro 1'], ['0197000002', 'Numéro 2']],
  1, 1,
], [
  numerosDeLaFiche(ENFANT).map((x) => [x.numero, x.nom]),
  numerosDeLaFiche({ phone: '0151000001', phone2: '0197000002' }).map((x) => [x.numero, x.nom]),
  numerosDeLaFiche({ phone: '0151000001', phone2: '01 51 00 00 01' }).length,
  numerosDeLaFiche({ phone: '0151000001' }).length,
]);

/* == #2 -- LE NUMERO A PREVENIR POUR CE RENDEZ-VOUS ==
   Le choix touche (meme ecrit autrement), sinon le dernier rendez-vous qui en
   portait un, sinon le premier numero ; une fiche a un seul numero : rien. */
dit(2, 'touche : papa (ecrit avec des espaces) ; rien touche : celui du dernier RDV ; un numero disparu de la fiche ne compte plus ; rien : le premier ; un seul numero : rien', [
  '0197000002', '0197000002', '0151000001', '0151000001', null,
], [
  numeroAPrevenirDuRdv({ choisi: '01 97 00 00 02', fiche: ENFANT }) ?? null,
  numeroAPrevenirDuRdv({ fiche: ENFANT, derniers: [
    { numeroAPrevenir: '0151000001', date: '2026-08-12' }, { numeroAPrevenir: '0197000002', date: '2026-10-01' }, { date: '2026-10-20' },
  ] }) ?? null,
  numeroAPrevenirDuRdv({ fiche: ENFANT, derniers: [{ numeroAPrevenir: '0166000009', date: '2026-10-25' }, { numeroAPrevenir: '0151000001', date: '2026-09-01' }] }) ?? null,
  numeroAPrevenirDuRdv({ fiche: ENFANT, derniers: [] }) ?? null,
  numeroAPrevenirDuRdv({ choisi: '0197000002', fiche: { phone: '0151000001' } }) ?? null,
]);

/* == #3 -- A QUI ECRIRE == */
dit(3, 'le numero a prevenir s il est pose, sinon le premier de la fiche', ['0197000002', '0151000001', ''],
  [telDuRdv({ numeroAPrevenir: '0197000002' }, ENFANT), telDuRdv({}, ENFANT), telDuRdv({}, undefined)]);

/* == #4 -- LE CABLAGE : la fenetre du RDV le pose, la fiche nomme les numeros,
   les deux fonctions lisent la meme regle, recopiee mot pour mot == */
{
  const fenetre = source('src/apps/trone/routes/clients/_shared.tsx');
  const fiche = source('src/apps/trone/routes/clients/Customers.tsx');
  dit(4, 'la fenetre : le choix paraît sur une fiche a deux numeros, et s ecrit a la modification comme a la creation', [true, 2, true], [
    fenetre.includes('{numerosDuRdv.length > 1 && (') && fenetre.includes('onClick={() => setNumeroAPrevenir(n.numero)}'),
    (fenetre.match(/numeroAPrevenir: numeroRetenu,/g) ?? []).length,
    fenetre.includes('numeroAPrevenirDuRdv({ choisi: numeroAPrevenir, fiche: rdvClient, derniers: sesRdv.filter((a) => a.id !== appt?.id) })'),
  ]);
  dit(4, 'la fiche enregistre le nom de chaque numero', [true, true], [
    fiche.includes('phoneNom: idPhoneNom.trim() || undefined'),
    fiche.includes('phone2Nom: numeroTelReel(idPhone2) ? idPhone2Nom.trim() || undefined : undefined'),
  ]);
  const regle = (s: string) => (s.match(/const telDuRdv = \([^]*?\.trim\(\);/) ?? [''])[0];
  const pur = regle(brut('src/shared/numero-a-prevenir-pur.ts'));
  const conf = brut('supabase/functions/confirmation-rdv/index.ts');
  const rapp = brut('supabase/functions/rappels-j1/index.ts');
  dit(4, 'les deux fonctions portent la regle mot pour mot, et lisent le numero par elle (1 + 2 envois)', [true, true, 1, 2, 0], [
    !!pur && regle(conf) === pur,
    !!pur && regle(rapp) === pur,
    (conf.match(/numeroIntl\(telDuRdv\(a, fiche\)\)/g) ?? []).length,
    (rapp.match(/numeroIntl\(telDuRdv\(a, fiche\)\)/g) ?? []).length,
    (conf.match(/numeroIntl\(fiche\?\.phone\)/g) ?? []).length + (rapp.match(/numeroIntl\(fiche\?\.phone\)/g) ?? []).length,
  ]);
}

console.log(ko === 0 ? 'Le parent qui a pris le rendez-vous est prevenu.' : `${ko} constat(s) en echec.`);
