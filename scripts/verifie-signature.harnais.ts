/* LA DEVISE, ÉPROUVÉE. « Quand l'IA répond aux messages, toujours avoir notre
   devise à la fin » (Yéman, 22 août 2026). Elle est posée par le code, jamais
   demandée au modèle — et ce harnais tient les deux promesses qui comptent :
   elle EST là, et elle n'y est jamais DEUX fois.
   Lancé par `node scripts/verifie-signature.mjs`. */
import {
  DEVISE_MAISON, houseSignature, porteLaDevise, signeLeMessage, maisonNom,
} from '../src/shared/identite';

let echecs = 0;
const dit = (ok: boolean, quoi: string) => {
  if (!ok) { echecs++; console.log(`  ÉCHEC — ${quoi}`); }
};

/* ① Un message sans devise la reçoit, en dernière ligne. */
const nu = 'Merci pour votre confiance, à très vite.';
const signe = signeLeMessage(nu);
dit(signe.startsWith(nu), 'le texte de l’IA est conservé mot pour mot');
dit(signe.endsWith(houseSignature()), 'la devise ferme le message');
dit(signe.includes(maisonNom()), 'le nom de la Maison accompagne la devise');

/* ② Elle ne se pose JAMAIS deux fois. Un modèle qui l'a déjà écrite — bien
   ou mal — ne doit pas voir la Maison signer en double sous un avis public. */
dit(!signeLeMessage(signe).endsWith(`${houseSignature()}\n\n${houseSignature()}`), 'pas de double signature');
dit(signeLeMessage(signe) === signe, 'signer deux fois ne change rien');
for (const ecorche of [
  'Merci ! mi nyɔ́ ɖɛkpɛ',          // la forme juste
  'Merci ! Mi Nyɔ́ Ɖɛkpɛ.',         // capitalisée
  'Merci ! mi nyo dekpe',           // sans diacritiques — la faute la plus probable
  'Merci ! mi nyɔ ɖɛkpɛ',           // sans le ton
]) dit(porteLaDevise(ecorche), `la devise est reconnue sous « ${ecorche.slice(8)} »`);

/* ③ Ce qui ne la porte pas est bien vu comme tel — sinon un message partirait nu. */
for (const sans of ['Merci pour votre visite.', 'Nous sommes beaux !', '']) {
  dit(!porteLaDevise(sans), `« ${sans} » ne porte pas la devise`);
}

/* ④ Un texte vide rend la signature seule, jamais deux lignes blanches. */
dit(signeLeMessage('') === houseSignature(), 'texte vide → la signature seule');
dit(signeLeMessage('Merci.   \n\n  ').endsWith(houseSignature()), 'les blancs de fin ne creusent pas le message');
dit(!signeLeMessage('Merci.\n\n\n').includes('\n\n\n'), 'jamais trois sauts de ligne');

/* ⑤ Le picto de la branche prend la place du monogramme, qui ne voyage pas. */
dit(signeLeMessage('Merci.', '❦').includes('❦'), 'le picto de la branche signe');
dit(DEVISE_MAISON === 'mi nyɔ́ ɖɛkpɛ', 'la devise s’écrit en fon, ton compris');

console.log(echecs === 0 ? 'Tout passe.' : `${echecs} échec(s).`);
if (echecs > 0) process.exit(1);
