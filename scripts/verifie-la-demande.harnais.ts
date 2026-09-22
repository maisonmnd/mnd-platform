/* LA QUESTION DE LA MAISON, ÉPROUVÉE — `node scripts/verifie-la-demande.mjs`.

   Ce qui se vérifie ici n'est pas le dessin, c'est la LANGUE : l'issue sûre a
   un nom, le bouton qui agit nomme son acte, et ce qu'un lecteur d'écran
   annonce porte tout ce qui décide. Une fenêtre bien dessinée dont les
   boutons disent « OK » et « Annuler » reproduit exactement le défaut de la
   fenêtre du navigateur qu'elle remplace. */
import {
  REFUS_PAR_DEFAUT, annonceDeLaDemande, libelleTropVague, libellesDeLaDemande,
} from '../src/shared/demande-pure';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── L'ISSUE SÛRE A TOUJOURS UN NOM ──────────────────────────────── */
dit('① l’issue sûre porte le nom qu’on lui donne',
  'Garder la fiche', libellesDeLaDemande({ accepter: 'Supprimer', refuser: 'Garder la fiche' }).refuser);
dit('② sans nom, elle dit ce qu’elle fait, et non « Annuler »',
  REFUS_PAR_DEFAUT, libellesDeLaDemande({ accepter: 'Supprimer' }).refuser);
dit('③ « Ne rien faire » est le défaut, jamais « Annuler »',
  'Ne rien faire', REFUS_PAR_DEFAUT);
dit('④ un nom fait d’espaces ne compte pas pour un nom',
  REFUS_PAR_DEFAUT, libellesDeLaDemande({ accepter: 'Supprimer', refuser: '   ' }).refuser);
dit('⑤ les deux libellés sont détourés',
  ['Supprimer définitivement', 'Garder la fiche'],
  [libellesDeLaDemande({ accepter: '  Supprimer définitivement ', refuser: ' Garder la fiche ' }).accepter,
    libellesDeLaDemande({ accepter: 'x', refuser: ' Garder la fiche ' }).refuser]);

/* ── LES MOTS QU'UN BOUTON N'A PAS LE DROIT DE DIRE ──────────────
   C'est le défaut même de `window.confirm` : on clique sur « OK » comme on
   acquiesce, pas comme on supprime une cliente. */
dit('⑥ « OK » ne dit pas ce qui va se passer', true, libelleTropVague('OK'));
dit('⑦ la casse ne sauve pas « Ok »', true, libelleTropVague('Ok'));
dit('⑧ « Confirmer » ne nomme aucun acte', true, libelleTropVague('Confirmer'));
dit('⑨ « Valider » non plus', true, libelleTropVague('Valider'));
dit('⑩ « Annuler » est ambigu dans un atelier où l’on annule des rendez-vous',
  true, libelleTropVague('Annuler'));
dit('⑪ « D’accord » avec l’apostrophe de la Maison', true, libelleTropVague('D’accord'));
dit('⑫ un acte nommé passe', false, libelleTropVague('Supprimer définitivement'));
dit('⑬ « Marquer payé » passe', false, libelleTropVague('Marquer payé'));
dit('⑭ « Archiver les 12 » passe', false, libelleTropVague('Archiver les 12'));
dit('⑮ un libellé vide ne trompe personne mais reste vague', false, libelleTropVague(''));

/* ── CE QUE LE LECTEUR D'ÉCRAN ANNONCE ───────────────────────────
   Il lit l'étiquette du dialogue. Sans composition, il annoncerait
   « dialogue » et rien d'autre, et la personne déciderait à l'aveugle. */
const DURE = {
  quoi: 'Suppression définitive',
  titre: 'Supprimer la fiche de A. K. ?',
  dit: 'Sa fiche quitte la Clientèle.',
  suite: 'Elle porte 12 rendez-vous.',
  scelle: 'Rien ne pourra la rétablir.',
  accepter: 'Supprimer définitivement',
  dur: true,
};
dit('⑯ l’annonce porte les cinq parties, dans l’ordre',
  'Suppression définitive · Supprimer la fiche de A. K. ? · Sa fiche quitte la Clientèle. · Elle porte 12 rendez-vous. · Rien ne pourra la rétablir.',
  annonceDeLaDemande(DURE));
dit('⑰ une question sans scellé ne laisse pas de trou dans l’annonce',
  'Paie · Marquer ce run payé ?', annonceDeLaDemande({ quoi: 'Paie', titre: 'Marquer ce run payé ?', accepter: 'Marquer payé' }));
dit('⑱ une partie vide ne met pas deux séparateurs',
  'Paie · Marquer ce run payé ?',
  annonceDeLaDemande({ quoi: 'Paie', titre: 'Marquer ce run payé ?', dit: '   ', accepter: 'Marquer payé' }));

/* ── LA LANGUE DE LA MAISON ──────────────────────────────────────── */
dit('⑲ aucun tiret cadratin dans le refus par défaut', false, REFUS_PAR_DEFAUT.includes('—'));
dit('⑳ le refus par défaut ne crie pas', false, REFUS_PAR_DEFAUT === REFUS_PAR_DEFAUT.toUpperCase());

console.log(ko === 0 ? `\nTOUT EST JUSTE (20 vérifications).` : `\n${ko} ÉCHEC(S).`);
if (ko > 0) process.exit(1);
