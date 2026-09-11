/* LA TOURNÉE DU MATIN, ÉPROUVÉE — `node scripts/verifie-tournee.mjs`.

   « Pourquoi les nouveaux RDV n'ont pas les tags ? » (Yéman). Parce qu'une
   ligne nue voulait dire trois choses incompatibles, et qu'aucune n'était
   écrite : pas encore passé, a échoué, personne à joindre. Les trois
   ressemblaient à « tout va bien ».

   CE QUI SE JOUE ICI EST UN SILENCE. Un rappel qui n'est pas parti sans que
   l'écran le dise, c'est une cliente qui ne vient pas et une place perdue ;
   c'est aussi, à l'échelle du cron du soir, deux semaines à chercher une
   panne que l'écran affichait comme normale. */
import { etatDeLaTournee, type LigneDeTournee } from '../src/shared/tournee';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const l = (canal: string, statut: string): LigneDeTournee => ({ canal, statut });
const e = (...lignes: LigneDeTournee[]) => etatDeLaTournee(lignes);

/* ── ① LE CAS DE CE MATIN — trois lignes, deux états différents ─────
   Les trois premières portaient « Sans l'appli » ET « WhatsApp auto » : le
   push n'a réveillé personne, le WhatsApp est bien parti. Les deux dernières
   ne portaient RIEN, et c'était la question. */
dit('sans appli mais WhatsApp parti : le rappel est fait',
  { partis: ['whatsapp'], sansAppli: true, rate: false, jamaisPasse: false, muet: false },
  e(l('push', 'sans-abonnement'), l('whatsapp', 'envoyé')));

dit('aucune ligne : le passage n’est pas venu',
  { partis: [], sansAppli: false, rate: false, jamaisPasse: true, muet: false },
  e());

/* ── ② LE SILENCE QUI TROMPE LE PLUS ────────────────────────────────
   « Sans l'appli » TOUT SEUL n'est pas un envoi : le push n'a réveillé
   personne, et le WhatsApp n'a même pas été tenté faute de numéro utilisable.
   Trois pastilles disaient cela ce matin-là, et l'on pouvait croire le
   travail fait. */
dit('sans appli TOUT SEUL : rien n’est parti',
  { partis: [], sansAppli: true, rate: false, jamaisPasse: false, muet: true },
  e(l('push', 'sans-abonnement')));

/* ── ③ L'ÉCHEC — la seule ligne qui appelle une main tout de suite ──
   Rien n'est arrivé, et rien ne se retentera avant le prochain passage. */
dit('un échec se voit',
  { partis: [], sansAppli: false, rate: true, jamaisPasse: false, muet: false },
  e(l('whatsapp', 'échec')));
/* UN ÉCHEC N'EST JAMAIS « MUET » : les deux appellent une main, mais pas le
   même diagnostic. Muet veut dire « on n'avait personne à joindre », échec
   veut dire « on a essayé et ça a cassé ». Les confondre ferait chercher un
   numéro là où c'est le jeton qui a expiré. */
dit('échec et muet ne se confondent jamais',
  { rate: true, muet: false },
  (({ rate, muet }) => ({ rate, muet }))(e(l('push', 'sans-abonnement'), l('whatsapp', 'échec'))));

/* UN ENVOI RÉUSSI COUVRE UN ÉCHEC SUR UN AUTRE CANAL — mais l'échec reste
   dit : le push est passé, le WhatsApp a cassé, et la Maison doit savoir que
   son WhatsApp est en panne avant que ce soit le seul canal d'une autre. */
dit('un canal réussi n’efface pas l’échec d’un autre',
  { partis: ['push'], sansAppli: false, rate: true, jamaisPasse: false, muet: false },
  e(l('push', 'envoyé'), l('whatsapp', 'échec')));

/* ── ④ LES ENVOIS RÉUSSIS, CHACUN NOMMÉ ─────────────────────────────
   L'écran montre par quel chemin elle a été prévenue : la Maison ne demande
   pas deux fois à quelqu'un qui a déjà reçu son message. */
dit('le push seul se dit', ['push'], e(l('push', 'envoyé')).partis);
dit('le SMS aussi', ['sms'], e(l('sms', 'envoyé')).partis);
dit('les trois canaux se cumulent', ['push', 'whatsapp', 'sms'],
  e(l('push', 'envoyé'), l('whatsapp', 'envoyé'), l('sms', 'envoyé')).partis);

/* ── ⑤ LES QUATRE ÉTATS SONT EXCLUSIFS DEUX À DEUX ──────────────────
   Sauf `sansAppli`, qui est un COMMENTAIRE et non un état : il accompagne
   aussi bien un WhatsApp parti qu'un silence complet. Si deux états de tête
   pouvaient être vrais ensemble, l'écran porterait deux pastilles qui se
   contredisent, et l'on ne saurait laquelle croire. */
const CAS: LigneDeTournee[][] = [
  [],
  [l('push', 'sans-abonnement')],
  [l('push', 'envoyé')],
  [l('whatsapp', 'échec')],
  [l('push', 'sans-abonnement'), l('whatsapp', 'envoyé')],
  [l('push', 'sans-abonnement'), l('whatsapp', 'échec')],
];
dit('jamais deux états de tête à la fois', [],
  CAS.map((c) => {
    const x = etatDeLaTournee(c);
    const n = [x.partis.length > 0, x.rate, x.jamaisPasse, x.muet].filter(Boolean).length;
    return n === 1 ? null : JSON.stringify(c);
  }).filter(Boolean));

/* ── ⑥ UN STATUT INCONNU NE MENT PAS ────────────────────────────────
   Le jour où un canal neuf écrira un verdict qu'on n'a pas prévu, la ligne
   ne doit pas passer pour un envoi réussi. Elle compte comme un silence :
   l'écran appelle une main, ce qui est la bonne erreur à faire. */
dit('un verdict inconnu ne passe pas pour un envoi',
  { partis: [], rate: false, jamaisPasse: false, muet: true },
  (({ partis, rate, jamaisPasse, muet }) => ({ partis, rate, jamaisPasse, muet }))(e(l('pigeon', 'en-route'))));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} épreuve(s) en échec.`);
