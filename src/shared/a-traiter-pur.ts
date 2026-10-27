/* ══ À TRAITER : LA BOÎTE QUI DIT QUOI FAIRE · 27 octobre 2026 ══════════
   « Je ne comprends pas bien la partie conversation. Peux-tu me faire une
   UI plus facile, une navigation plus fluide ? » (Yéman, sur une capture de
   la vue : deux rangées d'onglets, cinq puces par ligne, « à répondre par
   un modèle, fenêtre fermée » partout, 40 boîtes « en attente » dont des
   « Merci » de 27 jours). Maquette HCVUUyvAxSxNFqQ82FXYpp, validée.

   Ce module dit, pour une boîte (`boite-unique-pur`) :
   · son GROUPE dans « À traiter » : maintenant (Santé, ou moins de 24 h),
     plus anciennes, ou « un merci, sans question » ;
   · sa PASTILLE, une seule par ligne, en mots simples ;
   · CE QU'IL FAUT FAIRE : une phrase, et les gestes dans l'ordre (le
     premier est le geste principal).
   Rien n'est deviné de ses mots au-delà du « merci » : la phrase dit ce que
   le Trône sait (la source, le délai, la fenêtre de 24 h, son RDV).

   Pur : `scripts/verifie-a-traiter.mjs` le prouve (et `--prouve`). */

import { resteEnClair } from './conversations';
import type { Boite } from './boite-unique-pur';

/* ── LE MERCI SANS QUESTION ─────────────────────────────────────────────── */

/** Les mots d'un message qui clôt sans rien demander. « oui » n'en est pas :
    il répond souvent à une question qui attend une suite. */
const MOTS_DU_MERCI = new Set([
  'merci', 'mercii', 'merciii', 'thanks', 'thank', 'you', 'amen', 'beaucoup', 'bcp', 'infiniment', 'mille', 'fois', 'encore',
  'ok', 'okay', 'oki', 'okk', 'dac', 'daccord', 'd', 'accord', 'super', 'parfait', 'top', 'cool', 'genial', 'tres', 'bien',
  'recu', 'note', 'entendu', 'ca', 'marche', 'je', 'confirme', 'pour', 'a', 'demain', 'bientot', 'tout', 'l', 'heure', 'tantot',
  'vous', 'aussi', 'de', 'meme', 'bonne', 'journee', 'soiree', 'nuit', 'fin', 'semaine', 'et', 'inchallah', 'inchaalla', 'inchalla',
  'insha', 'allah', 'dieu', 'benisse', 'vous', 'madame', 'maman', 'tata', 'ma', 'chere', 'c', 'est', 'gentil', 'vraiment',
]);
/** Ce qui fait d'un message un merci (au moins un de ces mots, ou un pouce, des mains jointes, un cœur). */
const MARQUES_DU_MERCI = new Set(['merci', 'mercii', 'merciii', 'thanks', 'amen', 'ok', 'okay', 'oki', 'okk', 'dac', 'daccord', 'super', 'parfait', 'top', 'cool', 'recu', 'note', 'entendu', 'marche', 'confirme']);
const EMOJI_DU_MERCI = /[\u{1F44D}\u{1F64F}\u{2764}\u{1F49B}\u{1F49C}\u{1F49A}\u{1F499}\u{1F60A}\u{1F970}\u{1F44C}\u{1F917}\u{2665}]/u;

/** UN MERCI, SANS QUESTION : court (80 signes au plus), sans « ? », fait
    seulement de mots qui remercient ou acquiescent, avec au moins une marque
    (merci, ok, d'accord, parfait…) ou un emoji de remerciement seul. */
export function estUnMerci(texte: string | undefined): boolean {
  const brut = (texte ?? '').trim();
  if (!brut || brut.length > 80 || brut.includes('?')) return false;
  const plat = brut.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const mots = plat.replace(/[’']/g, ' ').split(/[^a-z]+/).filter(Boolean);
  if (mots.length === 0) return EMOJI_DU_MERCI.test(brut);
  return mots.every((m) => MOTS_DU_MERCI.has(m)) && mots.some((m) => MARQUES_DU_MERCI.has(m));
}

/* ── LES GROUPES DE « À TRAITER » ─────────────────────────────────────────── */

export type GroupeATraiter = 'maintenant' | 'plus' | 'merci';
export const GROUPES_A_TRAITER: readonly GroupeATraiter[] = ['maintenant', 'plus', 'merci'];
export const GROUPE_DIT: Record<GroupeATraiter, string> = {
  maintenant: 'Maintenant', plus: 'Plus anciennes', merci: 'Un merci, sans question',
};
const JOUR_MS = 86_400_000;

type BoiteLue = Pick<Boite, 'attendUneReponse' | 'pourquoi' | 'sante' | 'enRetard' | 'derniere' | 'derniereDElle' | 'depuisMs'>;

/** SES DERNIERS MOTS NE DEMANDENT RIEN : elle n'attend que pour ses mots
    (WhatsApp, chat), et son dernier message est un merci. */
export const attendPourUnMerci = (b: BoiteLue): boolean =>
  b.attendUneReponse && b.pourquoi.every((p) => p === 'whatsapp' || p === 'chat') && estUnMerci(b.derniereDElle?.texte);

/** LE GROUPE D'UNE BOÎTE QUI ATTEND (null sinon). Santé et un souci en
    retard vont toujours en tête, quel que soit leur âge. */
export function groupeDe(b: BoiteLue, maintenant: number): GroupeATraiter | null {
  if (!b.attendUneReponse) return null;
  if (attendPourUnMerci(b)) return 'merci';
  if (b.sante || b.enRetard) return 'maintenant';
  const quand = b.derniereDElle?.quand ?? b.derniere?.quand;
  const t = quand ? Date.parse(quand) : NaN;
  const age = Number.isFinite(t) ? maintenant - t : (b.depuisMs ?? 0);
  return age < JOUR_MS ? 'maintenant' : 'plus';
}

/* ── LA PASTILLE : une par ligne, en mots simples ─────────────────────────── */

export type TonDeLaPastille = 'terre' | 'cuivre' | 'indigo' | 'contour' | 'calme' | 'vert';
export type Pastille = { dit: string; ton: TonDeLaPastille };

type BoitePourLaPastille = BoiteLue & Pick<Boite, 'niveauDuSouci' | 'fil' | 'questionFranche' | 'demandes' | 'rangee' | 'quiALaMain'>;

export function pastilleDe(b: BoitePourLaPastille): Pastille {
  if (!b.attendUneReponse) {
    if (b.rangee) return { dit: 'Rien à répondre', ton: 'vert' };
    if (b.fil?.automate?.tenue === 'tenu') return { dit: 'L’automate a la main', ton: 'calme' };
    if (b.quiALaMain === 'devenue cliente') return { dit: 'Devenue cliente', ton: 'vert' };
    return { dit: 'Rien à faire', ton: 'calme' };
  }
  const p = b.pourquoi;
  if (p.includes('souci') && b.niveauDuSouci === 'sante') return { dit: b.enRetard ? 'Santé · rappel en retard' : 'Santé · rappeler sous 24 h', ton: 'terre' };
  if (p.includes('souci') && b.niveauDuSouci === 'voir') return { dit: b.enRetard ? 'À voir · en retard' : 'À voir sous 48 h', ton: 'terre' };
  if (p.includes('appel-wa') || p.includes('appel')) return { dit: 'Rappeler', ton: 'terre' };
  if (p.includes('demande')) return { dit: b.demandes.some((d) => d.apptId) ? 'Confirmer sa place' : 'Demande à traiter', ton: 'indigo' };
  if (attendPourUnMerci(b)) return { dit: 'Un merci : rien à répondre ?', ton: 'calme' };
  if (p.includes('chat')) return { dit: 'Répondre sur le chat', ton: 'cuivre' };
  if (p.includes('souci')) return { dit: 'Un mot à lire', ton: 'cuivre' };
  if (b.questionFranche) return { dit: 'Demande si c’est une personne', ton: 'cuivre' };
  if (b.fil?.fenetre.ouverte) return { dit: `Répondre · encore ${resteEnClair(b.fil.fenetre.resteMs)}`, ton: 'cuivre' };
  return { dit: 'Plus de 24 h : un modèle', ton: 'contour' };
}

/* ── CE QU'IL FAUT FAIRE ──────────────────────────────────────────────────── */

export type GesteATraiter =
  | 'appeler' | 'noter-souci' | 'repondre' | 'modele' | 'repondre-chat' | 'rien-a-repondre'
  | 'poser-rdv' | 'voir-sa-place' | 'demande-traitee' | 'appel-fait' | 'en-faire-une-cliente';
export type CeQuIlFautFaire = { phrase: string; gestes: { cle: GesteATraiter; dit: string }[] };

type BoitePourLeGeste = BoitePourLaPastille & Pick<Boite, 'soucisOuverts' | 'appelsWa' | 'appels' | 'sansFiche' | 'discussions' | 'numero'>;

const ilYA = (iso: string | undefined, maintenant: number): string => {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.floor((maintenant - t) / 60_000));
  if (min < 60) return min <= 1 ? 'à l’instant' : `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} jours`;
};

/** UNE PHRASE ET SES GESTES. `prochainRdv` : son prochain RDV déjà dit
    (« jeu. 29 oct. 2026 à 14 h »), ajouté quand il éclaire la suite. */
export function ceQuIlFautFaire(b: BoitePourLeGeste, o: { maintenant: number; prochainRdv?: string }): CeQuIlFautFaire {
  const g = (cle: GesteATraiter, dit: string) => ({ cle, dit });
  const rdv = o.prochainRdv ? ` Son prochain RDV : ${o.prochainRdv}.` : '';
  const ecrireLibrement = !!b.fil?.fenetre.ouverte;
  const peutAppeler = !!b.numero;
  if (!b.attendUneReponse) {
    if (b.rangee) return { phrase: `Rien à répondre : elle revient seule dans « À traiter » à son prochain message.${rdv}`, gestes: [] };
    if (b.fil?.automate?.tenue === 'tenu') return { phrase: `L’automate lui répond et tient la conversation.${rdv}`, gestes: [] };
    return { phrase: `Rien à faire.${rdv}`, gestes: [] };
  }
  const p = b.pourquoi;
  if (p.includes('souci') && (b.niveauDuSouci === 'sante' || b.niveauDuSouci === 'voir')) {
    const s = b.soucisOuverts[0];
    const sante = b.niveauDuSouci === 'sante';
    const phrase = sante
      ? `Souci Santé signalé ${ilYA(s?.quand, o.maintenant)}${b.enRetard ? ', et le rappel est en retard' : ''}. Une personne de la Maison la rappelle sous 24 h.`
      : `Souci « À voir » signalé ${ilYA(s?.quand, o.maintenant)}${b.enRetard ? ', et la réponse est en retard' : ''} : à regarder sous 48 h.`;
    return { phrase: phrase + rdv, gestes: [...(peutAppeler ? [g('appeler', 'L’appeler')] : []), g('noter-souci', 'Noter et clore le souci'), ...(ecrireLibrement ? [g('repondre', 'Lui écrire')] : [])] };
  }
  if (p.includes('appel-wa')) {
    const a = b.appelsWa[b.appelsWa.length - 1];
    return { phrase: `Appel WhatsApp manqué ${ilYA(a?.sonneLe, o.maintenant)} : personne n’a décroché.${rdv}`, gestes: [g('appeler', 'La rappeler'), ...(ecrireLibrement ? [g('repondre', 'Lui écrire qu’on la rappelle')] : [])] };
  }
  if (p.includes('appel')) {
    const a = b.appels.find((x) => !x.fait);
    const motif = a?.motif?.trim();
    return { phrase: `Elle a appelé ${ilYA(a?.at, o.maintenant)}${motif ? ` : « ${motif} »` : ''}. Il faut la rappeler.${rdv}`, gestes: [...(peutAppeler ? [g('appeler', 'La rappeler')] : []), g('appel-fait', 'Noter l’appel fait')] };
  }
  if (p.includes('demande')) {
    const d = b.demandes.find((x) => x.apptId) ?? b.demandes[0];
    if (d?.apptId) {
      return { phrase: `Elle a pris une place sur le site, il reste à la confirmer.${rdv}`, gestes: [g('voir-sa-place', 'Voir sa place au calendrier'), ...(peutAppeler ? [g('appeler', 'L’appeler')] : []), g('demande-traitee', 'Demande traitée')] };
    }
    return {
      phrase: `Demande du site ${ilYA(d?.createdAt, o.maintenant)}${d?.mot?.trim() ? ` : « ${d.mot.trim().slice(0, 120)} »` : ''}.`,
      gestes: [g('poser-rdv', 'Poser son RDV'), ...(peutAppeler ? [g('appeler', 'L’appeler')] : []), ...(b.sansFiche ? [g('en-faire-une-cliente', 'En faire une cliente')] : []), g('demande-traitee', 'Demande traitée')],
    };
  }
  if (attendPourUnMerci(b)) {
    return { phrase: `Son dernier message est un merci, sans question. Rien n’attend de réponse : rangez-la, elle revient seule à son prochain message.${rdv}`, gestes: [g('rien-a-repondre', 'Rien à répondre')] };
  }
  if (p.includes('chat')) {
    return { phrase: `Elle écrit sur le chat du site${b.sansFiche ? ', et n’a pas encore de fiche' : ''}. La réponse part au nom de la Maison.`, gestes: [g('repondre-chat', 'Répondre sur le chat'), ...(b.sansFiche ? [g('en-faire-une-cliente', 'En faire une cliente')] : []), g('rien-a-repondre', 'Rien à répondre')] };
  }
  if (b.questionFranche) {
    return { phrase: 'Elle demande si elle parle à une personne : répondez-lui franchement, de votre main.', gestes: [g('repondre', 'Lui répondre')] };
  }
  if (b.fil?.automate?.tenue === 'main') {
    return { phrase: `L’automate a passé la main : elle attend une personne de la Maison.${rdv}`, gestes: [g('repondre', 'Lui répondre'), g('rien-a-repondre', 'Rien à répondre')] };
  }
  if (ecrireLibrement) {
    return { phrase: `Elle attend une réponse. Vous pouvez lui écrire librement encore ${resteEnClair(b.fil!.fenetre.resteMs)}.${rdv}`, gestes: [g('repondre', 'Lui répondre'), g('rien-a-repondre', 'Rien à répondre')] };
  }
  return {
    phrase: `Son dernier message date de plus de 24 h : WhatsApp n’accepte plus qu’un modèle approuvé. Dès qu’elle répond, vous écrivez de nouveau librement.${rdv}`,
    gestes: [g('modele', 'Choisir un modèle'), ...(peutAppeler ? [g('appeler', 'L’appeler')] : []), g('rien-a-repondre', 'Rien à répondre')],
  };
}
