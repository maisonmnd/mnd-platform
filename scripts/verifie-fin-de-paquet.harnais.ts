/* LA FIN DE PAQUET, ÉPROUVÉE — `node scripts/verifie-fin-de-paquet.mjs`.

   « Il vous reste 2 soins, jusqu'au 12 juin » est le message qui rapporte le
   plus, et le plus dangereux s'il est faux : un compteur qu'elle conteste est
   pire qu'aucun message. Ce harnais tient les trois arbitrages du
   15 septembre 2026 (une séance OU quinze jours, le premier des deux ; sans
   date, à la dernière séance ; jamais un paquet expiré), la règle de la
   prestation LA PLUS CONTRAINTE, et les heures où la Maison écrit. */
import {
  paquetsEnFin, SEUIL_FIN_DE_PAQUET, type ContratPourLaFin, type Plan, type Subscriber,
} from '../src/shared/abonnements';
import {
  variablesDeLaFinDePaquet, phraseDeLaFinDePaquet, estLHeureDEcrire, idDuVerrou, colisDeLaFinDePaquet, gesteDuPassage,
} from '../src/shared/fin-de-paquet';
import { colisDuMerci, idDuMerci, MODELE_DU_MERCI } from '../src/shared/merci-en-salle';
import { readFileSync } from 'node:fs';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const AUJOURDHUI = '2026-09-15';
const pack = { id: 'pl-6', name: 'Prolongement 6 soins', mode: 'pack' } as unknown as Plan;
const cycle = { id: 'pl-m', name: 'La Suite', mode: 'cycle' } as unknown as Plan;
const sub = (o: Partial<Subscriber>): Subscriber =>
  ({ id: 's1', branchId: 'b1', clientId: 'c1', name: 'R. A.', planId: 'pl-6', ...o } as unknown as Subscriber);
const ligne = (qty: number | null, used: number) =>
  ({ serviceId: 'sv', qty, used, remaining: qty === null ? null : Math.max(0, qty - used), rdv: [] });
const contrat = (o: Partial<ContratPourLaFin>): ContratPourLaFin =>
  ({ sub: sub({}), plan: pack, etat: 'en-cours', lignes: [ligne(6, 5)], ...o });

/* ── ① LE SEUIL : une séance, ou quinze jours ─────────────────────── */
dit('le seuil est une séance ou quinze jours', { seances: 1, jours: 15 }, SEUIL_FIN_DE_PAQUET);
dit('à la dernière séance, on prévient', 'derniere-seance',
  paquetsEnFin([contrat({ sub: sub({ expiresIso: '2026-12-01' }) })], AUJOURDHUI)[0]?.motif);
dit('à deux séances et quarante jours, rien', 0,
  paquetsEnFin([contrat({ sub: sub({ expiresIso: '2026-10-25' }), lignes: [ligne(6, 4)] })], AUJOURDHUI).length);
dit('à deux séances et dix jours, la date approche', 'date-proche',
  paquetsEnFin([contrat({ sub: sub({ expiresIso: '2026-09-25' }), lignes: [ligne(6, 4)] })], AUJOURDHUI)[0]?.motif);
dit('à quinze jours exactement, on prévient', 'date-proche',
  paquetsEnFin([contrat({ sub: sub({ expiresIso: '2026-09-30' }), lignes: [ligne(6, 4)] })], AUJOURDHUI)[0]?.motif);
dit('à seize jours, pas encore', 0,
  paquetsEnFin([contrat({ sub: sub({ expiresIso: '2026-10-01' }), lignes: [ligne(6, 4)] })], AUJOURDHUI).length);

/* ── ② LA PRESTATION LA PLUS CONTRAINTE COMMANDE ──────────────────── */
dit('six lavages et un resserrage : c’est le resserrage qui compte', 1,
  paquetsEnFin([contrat({ lignes: [ligne(6, 0), ligne(6, 5)] })], AUJOURDHUI)[0]?.reste);
dit('l’illimité ne compte pas', 'derniere-seance',
  paquetsEnFin([contrat({ lignes: [ligne(null, 12), ligne(6, 5)] })], AUJOURDHUI)[0]?.motif);
dit('un paquet sans prestation bornée n’a rien à annoncer', 0,
  paquetsEnFin([contrat({ lignes: [ligne(null, 3)] })], AUJOURDHUI).length);

/* ── ③ CE QUI NE SE PRÉVIENT PAS ──────────────────────────────────── */
dit('un abonnement à cycle ne s’épuise pas', 0,
  paquetsEnFin([contrat({ plan: cycle, lignes: [ligne(2, 1)] })], AUJOURDHUI).length);
dit('un paquet épuisé n’a plus rien à dire', 0,
  paquetsEnFin([contrat({ etat: 'epuise', lignes: [ligne(6, 6)] })], AUJOURDHUI).length);
dit('un paquet résilié non plus', 0,
  paquetsEnFin([contrat({ etat: 'resilie' })], AUJOURDHUI).length);
/* « IL VOUS RESTE UNE SÉANCE JUSQU'AU 12 JUIN » EN SEPTEMBRE SERAIT UNE FAUTE. */
dit('un paquet expiré ne se prévient plus', 0,
  paquetsEnFin([contrat({ sub: sub({ expiresIso: '2026-06-12' }) })], AUJOURDHUI).length);
dit('… le jour même de la date limite, encore', 1,
  paquetsEnFin([contrat({ sub: sub({ expiresIso: AUJOURDHUI }) })], AUJOURDHUI).length);
dit('sans formule retrouvée, rien', 0,
  paquetsEnFin([contrat({ plan: undefined })], AUJOURDHUI).length);

/* ── ④ SANS DATE, À LA DERNIÈRE SÉANCE ────────────────────────────── */
const sansDate = paquetsEnFin([contrat({ sub: sub({ expiresIso: null }) })], AUJOURDHUI)[0];
dit('un paquet sans date se prévient à la dernière séance', 'derniere-seance', sansDate?.motif);
dit('… et ne porte pas de date', null, sansDate?.jusquau);
dit('… à deux séances, il attend', 0,
  paquetsEnFin([contrat({ sub: sub({ expiresIso: null }), lignes: [ligne(6, 4)] })], AUJOURDHUI).length);

/* ── ⑤ LE MESSAGE, MOT POUR MOT ───────────────────────────────────── */
const avecDate = paquetsEnFin([contrat({ sub: sub({ expiresIso: '2026-10-12' }) })], AUJOURDHUI)[0];
dit('les quatre variables du modèle',
  /* Son appel et l'année (10 octobre 2026, revue). */
  ['R.', '1 séance', 'Prolongement 6 soins', 'valable jusqu’au 12 octobre 2026'],
  variablesDeLaFinDePaquet(avecDate));
dit('… au pluriel quand il en reste deux', '2 séances',
  variablesDeLaFinDePaquet(paquetsEnFin([contrat({ sub: sub({ expiresIso: '2026-09-20' }), lignes: [ligne(6, 4)] })], AUJOURDHUI)[0])[1]);
dit('… sans date : « sans date limite », jamais une variable vide', 'sans date limite',
  variablesDeLaFinDePaquet(sansDate)[3]);
dit('la phrase du fil est celle du modèle',
  'Bonjour R., il vous reste 1 séance sur votre Prolongement 6 soins, valable jusqu’au 12 octobre 2026. Pensez à réserver : nous vous gardons votre place.',
  phraseDeLaFinDePaquet(avecDate));
dit('sans nom ni civilité, « Madame, Monsieur », jamais Madame supposé', 'Madame, Monsieur',
  variablesDeLaFinDePaquet({ ...avecDate, nom: '  ' })[0]);

/* ── ⑥ JAMAIS LA NUIT, ET UN VERROU PAR CONTRAT ───────────────────── */
dit('à 9 h 29, on attend', false, estLHeureDEcrire(9 + 29 / 60));
dit('à 9 h 30, on écrit', true, estLHeureDEcrire(9.5));
dit('à 21 h 29, encore', true, estLHeureDEcrire(21 + 29 / 60));
dit('à 21 h 30, plus', false, estLHeureDEcrire(21.5));
dit('à 3 h du matin, jamais', false, estLHeureDEcrire(3));
dit('le verrou porte le contrat', 'env-paquet-s1', idDuVerrou('s1'));

/* ── ⑦ PAR LA SALLE D'ATTENTE (29 octobre 2026) ──────────────────────
   « Pour que je contrôle toujours avant qu'ils partent » : la fin de paquet
   et le merci à la marraine se déposent dix minutes en salle, comme les
   autres envois automatiques ; le facteur les porte. */
const colis = colisDeLaFinDePaquet(avecDate, undefined, '22990000001');
dit('le colis de la salle : le modèle, ses quatre variables, et la phrase du fil',
  ['whatsapp', '22990000001', 'fin_de_paquet', ['R.', '1 séance', 'Prolongement 6 soins', 'valable jusqu’au 12 octobre 2026'], phraseDeLaFinDePaquet(avecDate), 'la Maison, automatiquement'],
  [colis.genre, colis.numero, colis.modele, colis.composants[0].parameters.map((x) => x.text), colis.texteAuFil, colis.parQui]);
const HIER = '2026-10-28T09:00:00.000Z';
dit('le passage, ligne par ligne : rien posé, la déposer ; envoyée, prévenue ; échec d avant-hier, la reprendre ; le reste, attendre',
  ['deposer', 'prevenue', 'reprendre', 'attendre', 'attendre', 'attendre', 'attendre', 'attendre', 'attendre'],
  [undefined, { statut: 'envoyé' }, { statut: 'échec', quand: '2026-10-27T09:00:00.000Z' }, { statut: 'échec', quand: '2026-10-28T10:00:00.000Z' },
    { statut: 'en-attente' }, { statut: 'retenu' }, { statut: 'écarté' }, { statut: 'périmé' }, { statut: 'en cours' }].map((l) => gesteDuPassage(l, HIER)));
const fdp = readFileSync('src/shared/fin-de-paquet.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
dit('la fin de paquet se dépose en salle quand le facteur vit, et part tout de suite sinon', [true, true, true, true],
  [/const parLaSalle = facteurVivant\(/.test(fdp), /statut: EN_ATTENTE, quand, deposeLe: quand,/.test(fdp),
    fdp.indexOf('if (parLaSalle)') >= 0 && fdp.indexOf('if (parLaSalle)') < fdp.indexOf('await envoieSurWhatsApp('),
    /heureDeDepart\(Date\.now\(\), REGLES_PAR_DEFAUT\)/.test(fdp)]);
dit('... prévenue seulement quand le facteur l a envoyée', true, /if \(geste === 'prevenue'\) \{[\s\S]{0,200}finPrevenueLe: le/.test(fdp));

dit('le merci : une ligne par récompense, la carte déposée en en-tête, les trois variables', [
  'env-merci-c-1-rec-2', 'parrainage_merci',
  [{ type: 'header', parameters: [{ type: 'image', image: { id: 'media-9' } }] }, { type: 'body', parameters: [{ type: 'text', text: 'Mme Awa' }, { type: 'text', text: 'Grâce' }, { type: 'text', text: 'un soin offert' }] }],
], [idDuMerci('c-1', 'rec-2'), MODELE_DU_MERCI, colisDuMerci({ numero: '22990000001', variables: ['Mme Awa', 'Grâce', 'un soin offert'], mediaId: 'media-9' }).composants]);
dit('... sans carte, pas d en-tête', ['body'], colisDuMerci({ numero: '2', variables: ['a', 'b', 'c'] }).composants.map((c) => c.type));
dit('... le fil garde les mots du modèle approuvé',
  'Bonjour Mme Awa, Grâce est venue à la Maison grâce à vous. Merci ! Votre récompense vous attend : un soin offert. Choisissez-la dans Ma Couronne, ou dites-le simplement à l’accueil.',
  colisDuMerci({ numero: '2', variables: ['Mme Awa', 'Grâce', 'un soin offert'] }).texteAuFil);
const merci = readFileSync('src/shared/merci-en-salle.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const crochet = readFileSync('src/apps/trone/shell/useParrainageVivant.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
dit('le merci se dépose en salle ; facteur muet, carte non déposée ou erreur : comme avant', [true, true, true, true, true],
  [/if \(!facteurVivant\(\(facteur\?\.data[\s\S]{0,60}Date\.now\(\)\)\) return 'repli';/.test(merci), /if \(o\.piece && !mediaId\) return 'repli';/.test(merci),
    /statut: EN_ATTENTE,/.test(merci), /=== '23505' \? 'deja' : 'repli'/.test(merci),
    /if \(issue !== 'repli'\) return;\s*await envoieSurWhatsApp\(/.test(crochet)]);
dit('... la carte se dépose chez Meta sans rien envoyer', true, /televerseSeulement: true, piece/.test(merci));

console.log(ko === 0 ? '\nLa fin de paquet tient.' : `\n${ko} épreuve(s) en échec.`);
