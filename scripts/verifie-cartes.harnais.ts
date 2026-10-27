/* LES CARTES DE LA MAISON, ÉPROUVÉES — `node scripts/verifie-cartes.mjs`.

   Une carte part CHEZ LA CLIENTE, en image, et ne se rattrape pas. Un accord
   manqué sur la version homme, une promesse que la Maison ne tient pas, un
   prénom vide au milieu du dessin : chacun se découvre après l'envoi. */
import {
  texteDeLaCarte, texteDeLaCarteSansPrenom, motDeLaCarte, objetDeLaCarte, nomDuFichier, prenomDe, numeroDeLaCarte,
  CARTES_DE_LA_MAISON, MOTIFS_DE_MERCI, type CleMotif,
} from '../src/shared/cartes';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① L'APPEL, CE QUI SE VOIT ─────────────────────────────────────
   La phrase de l'anniversaire s'accorde avec l'ANNÉE, pas avec la personne :
   elle se dit donc pareil à tout le monde. Sans l'appel au-dessus du prénom,
   la version homme ne se distinguerait que par un « e » au milieu d'un
   paragraphe, et l'on ne saurait jamais si l'on a envoyé la bonne. */
const anniF = texteDeLaCarte({ carte: 'anniversaire', genre: 'femme', prenom: 'Baké' });
const anniH = texteDeLaCarte({ carte: 'anniversaire', genre: 'homme', prenom: 'Kossi' });
dit('elle est appelée « Chère »', 'Chère', anniF.appel);
dit('il est appelé « Cher »', 'Cher', anniH.appel);
dit('la phrase ne change pas', true, anniF.phrase === anniH.phrase);
dit('l’accord du corps, lui, change', true, anniF.corps !== anniH.corps);
dit('elle est entourée', true, anniF.corps.includes('entourée'));
dit('il est entouré', true, anniH.corps.includes('entouré de'));

/* ── ② LE SEUL TITRE QUI S'ACCORDE ─────────────────────────────────
   « Merci d'être venue » partira plus souvent que tous les autres : il fallait
   qu'on ne puisse pas se tromper, et cela se voit dans le grand mot. */
const venueF = texteDeLaCarte({ carte: 'merci', motif: 'venue', genre: 'femme', prenom: 'Baké' });
const venueH = texteDeLaCarte({ carte: 'merci', motif: 'venue', genre: 'homme', prenom: 'Kossi' });
dit('d’être venue', 'd’être venue', venueF.grand);
dit('d’être venu', 'd’être venu', venueH.grand);
/* LES AUTRES TITRES NE S'ACCORDENT PAS, et c'est juste : « de ta confiance »
   ne porte aucun genre. */
for (const m of ['confiance', 'parle', 'etoiles', 'annee'] as CleMotif[]) {
  dit(`« ${m} » se dit pareil aux deux`, true,
    texteDeLaCarte({ carte: 'merci', motif: m, genre: 'femme', prenom: 'X' }).grand
    === texteDeLaCarte({ carte: 'merci', motif: m, genre: 'homme', prenom: 'X' }).grand);
}

/* ── ③ AUCUNE PROMESSE QUE LA MAISON NE TIENT PAS ──────────────────
   Le programme de points n'est pas activé. Une carte qui annoncerait un geste
   offert se retournerait au fauteuil, devant la cliente. */
const cercle = texteDeLaCarte({ carte: 'cercle', genre: 'femme', prenom: 'Baké' });
dit('le Cercle ne promet pas de points', false, /point|offert|cadeau|réduction/i.test(cercle.corps));
dit('… ni dans sa phrase', false, /point|offert|cadeau|réduction/i.test(cercle.phrase));
dit('il se signe autrement', 'Bienvenue parmi les nôtres.', cercle.signe);
dit('et il porte le fond profond', 'profond', cercle.fond);

/* ── ④ LA CARTE DES ÉTOILES NE NOMME PAS LA PLATEFORME ─────────────
   Elle part à la cliente, pas à Google, et elle reste juste le jour où l'avis
   vient d'ailleurs. */
const etoiles = texteDeLaCarte({ carte: 'merci', motif: 'etoiles', genre: 'femme', prenom: 'Baké' });
dit('aucune plateforme nommée', false, /google|facebook|avis google/i.test(etoiles.corps + etoiles.phrase));
dit('son emblème est les étoiles', 'etoiles', etoiles.deco);

/* ── ⑤ CHAQUE VARIANTE EST COMPLÈTE ────────────────────────────────
   Un champ vide au milieu du dessin ne se voit qu'une fois l'image envoyée. */
const toutes = [
  { carte: 'anniversaire' as const, motif: undefined },
  { carte: 'cercle' as const, motif: undefined },
  ...MOTIFS_DE_MERCI.map((m) => ({ carte: 'merci' as const, motif: m.cle })),
];
let creuses = 0;
for (const v of toutes) {
  for (const g of ['femme', 'homme'] as const) {
    const c = texteDeLaCarte({ ...v, genre: g, prenom: 'Baké' });
    if (!c.sur || !c.grand || !c.appel || !c.phrase || !c.corps || !c.signe || !c.grandTaille) creuses++;
  }
}
dit('quatorze variantes, aucune creuse', 0, creuses);
dit('trois cartes proposées', 3, CARTES_DE_LA_MAISON.length);
dit('cinq motifs de merci', 5, MOTIFS_DE_MERCI.length);

/* ── ⑥ LE PRÉNOM ───────────────────────────────────────────────────
   C'est lui qu'on écrit sur une carte, jamais l'état civil. */
dit('le prénom seul', 'Christelle', prenomDe('Christelle Vlavonou'));
dit('… même avec des espaces', 'Baké', prenomDe('  Baké  Euzen '));
dit('un nom vide ne rend rien', '', prenomDe('   '));

/* ── ⑦ LE MOT QUI ACCOMPAGNE ───────────────────────────────────────
   Signé PAR LE CODE : la devise s'écorche une fois sur vingt quand on la
   recopie, et « mi nyo dekpe » sous un envoi public serait pire que rien. */
const mot = motDeLaCarte({ carte: 'anniversaire', genre: 'femme', prenom: 'Baké' });
dit('le mot nomme la tête', true, mot.includes('Baké'));
/* LE BANC PORTE SUR LE FON, PAS SUR L'ÉCHO FRANÇAIS — 25 septembre 2026.
   Il exigeait « la maison veille », l'écho d'alors, et il a crié le jour où
   l'écho a changé. Il a eu raison de crier : c'est son métier. Mais la règle
   qu'il garde n'est pas « ce message dit la maison veille », c'est « ce
   message porte la devise de la Maison ». Cette devise, c'est le fon ; le
   français qui la suit a déjà changé deux fois. On écrit donc le fon en
   toutes lettres ici, ton compris, et non `DEVISE_COMPLETE` : un banc qui
   lirait la même constante que le code éprouvé passerait même si elle
   devenait vide. */
dit('… et porte la devise', true, mot.toLowerCase().includes('mi nyɔ́ ɖɛkpɛ'));
dit('sans prénom, il reste poli', true,
  motDeLaCarte({ carte: 'merci', motif: 'venue', genre: 'femme', prenom: '  ' })
    .includes('Chère tête couronnée'));
/* LE MOT SUIT LE GENRE, comme la carte : deux textes qui divergeraient
   feraient une image au masculin sous un message au féminin. */
dit('le mot s’accorde aussi', true,
  motDeLaCarte({ carte: 'merci', motif: 'venue', genre: 'homme', prenom: 'Kossi' })
    .includes('d’être venu,'));

dit('l’objet dit l’anniversaire', 'Joyeux anniversaire, Baké',
  objetDeLaCarte({ carte: 'anniversaire', genre: 'femme', prenom: 'Baké' }));

/* ── ⑧ LE NOM DU FICHIER ───────────────────────────────────────────
   Il traverse Windows, WhatsApp et une boîte mail, et chacun écorche un
   caractère différent : ni accent, ni apostrophe, ni espace. */
dit('sans accent ni espace', 'anniversaire-bake.png',
  nomDuFichier({ carte: 'anniversaire', genre: 'femme', prenom: 'Baké' }));
dit('le motif s’y lit', 'merci-etoiles-christelle.png',
  nomDuFichier({ carte: 'merci', motif: 'etoiles', genre: 'femme', prenom: 'Christelle' }));
dit('sans prénom, il reste un nom', 'cercle.png',
  nomDuFichier({ carte: 'cercle', genre: 'femme', prenom: '  ' }));
dit('rien d’exotique n’y survit', true,
  /^[a-z0-9.-]+$/.test(nomDuFichier({ carte: 'merci', motif: 'annee', genre: 'homme', prenom: 'Élodie N’Dah' })));

/* ── LA CARTE SANS PRÉNOM (27 octobre 2026) ──────────────────────────
   Celle que Meta joint en tête des anniversaires automatiques : son image vit
   à une adresse publique, elle va à une cliente, à un client, ou à un enfant
   par son parent. Elle ne nomme personne et ne choisit ni « tu » ni « vous ». */
const sansPrenom = texteDeLaCarteSansPrenom();
const toutSonTexte = [sansPrenom.appel, sansPrenom.prenom, sansPrenom.phrase, sansPrenom.corps, sansPrenom.signe].join(' ');
dit('la carte sans prénom : ni appel, la place du prénom porte « Belle année »', ['', 'Belle année'], [sansPrenom.appel, sansPrenom.prenom]);
dit('... ni « tu » ni « vous », aucun accord de genre (entouré·e, venu·e, cher·ère)', false,
  /\b(te|tu|toi|ton|ta|tes|vous|votre|vos)\b|\bt[’']|entouré|\bvenue?\b|\bch[eè]re?\b/i.test(toutSonTexte));
dit('... le dessin d’anniversaire de la Maison : ballons, fond clair, « Joyeux anniversaire »', ['ballons', 'clair', 'Joyeux', 'anniversaire'],
  [sansPrenom.deco, sansPrenom.fond, sansPrenom.sur, sansPrenom.grand]);

/* ── À QUEL NUMÉRO PART LA CARTE (27 octobre 2026) ───────────────────
   « Pour le compte d'un enfant, au numéro du parent payeur » (Yéman), comme
   l'Assistant Maison : l'enfant du foyer va au parent même avec son numéro. */
const tetes = [{ id: 'p', name: 'H. P.', phone: '+229 01 51 00 00 18' }, { id: 'q', name: 'Q. Q.', phone: '' }];
const foyers = [{ id: 'f', payerClientId: 'p' }, { id: 'g', payerClientId: 'q' }];
const J = '2026-10-27';
dit('l’enfant du foyer, même avec un numéro sur sa fiche : au parent payeur', { numero: '2290151000018', parent: 'H. P.' },
  numeroDeLaCarte({ id: 'e', phone: '+229 01 97 00 00 01', familyId: 'f', birthday: '2016-10-27' }, tetes, foyers, J));
dit('... sans date de naissance, rien ne prouve sa majorité : au parent payeur aussi', '2290151000018',
  numeroDeLaCarte({ id: 'e', phone: '+229 01 97 00 00 01', familyId: 'f' }, tetes, foyers, J).numero);
dit('... un adulte du foyer à son propre numéro reçoit chez lui ; sans numéro, chez le payeur', ['2290197000001', '2290151000018'],
  [numeroDeLaCarte({ id: 'a', phone: '+229 01 97 00 00 01', familyId: 'f', birthday: '1980-10-27' }, tetes, foyers, J).numero,
    numeroDeLaCarte({ id: 'a', phone: '', familyId: 'f', birthday: '1980-10-27' }, tetes, foyers, J).numero]);
dit('... un parent payeur sans numéro : la carte de l’enfant reste à son numéro ; personne : rien', ['2290197000001', ''],
  [numeroDeLaCarte({ id: 'e', phone: '+229 01 97 00 00 01', familyId: 'g', birthday: '2016-10-27' }, tetes, foyers, J).numero,
    numeroDeLaCarte({ id: 'e', phone: '', familyId: 'g', birthday: '2016-10-27' }, tetes, foyers, J).numero]);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
