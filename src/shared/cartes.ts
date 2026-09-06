/* ══ LES CARTES DE LA MAISON — 6 septembre 2026 (maquette validée) ═══

   « Chaque fois qu'un client fête son anniversaire, j'aimerais qu'il reçoive
   cette carte », puis « dans le même élan, une carte de remerciement, et une
   carte pour annoncer qu'il ou elle est dans le Cercle » (Yéman).

   TROIS CARTES, UN SEUL GABARIT. Elles se dessinent du même modèle : un seul
   endroit à corriger, et la version homme n'est jamais une copie qui aurait
   oublié un accord. C'est la raison d'être de ce fichier — les mots vivent
   ici, PURS, et le dessin les prend tels quels (`ds/carte.ts`).

   LE GENRE NE CHANGE QUE CE QU'IL DOIT. La phrase de l'anniversaire souhaite
   au lieu d'affirmer, et ses accords portent sur l'année, pas sur la personne :
   elle se dit donc pareil à tout le monde. Ce qui distingue les deux versions
   est l'APPEL — « Chère » ou « Cher » — posé au-dessus du prénom. Sans lui, la
   version homme ne se serait distinguée que par un « e » au milieu d'un
   paragraphe, et l'on n'aurait jamais su, d'un coup d'œil, si l'on avait
   envoyé la bonne.

   AUCUNE PROMESSE QUE LA MAISON NE TIENT PAS. La carte du Cercle n'annonce ni
   points ni geste offert : le programme de points n'est pas activé
   (`pointsEnabledStore`, shared/offers), et une carte qui annonce un avantage
   inexistant se retourne au fauteuil, devant la cliente. */

import { signeLeMessage } from './identite';

export type Genre = 'femme' | 'homme';
export type CleCarte = 'anniversaire' | 'merci' | 'cercle';
export type CleMotif = 'venue' | 'confiance' | 'parle' | 'etoiles' | 'annee';

/** Le jour ou le soir. Le Cercle est une cérémonie, il lui fallait sa
    profondeur ; un troisième fond aurait dilué la marque. */
export type Fond = 'clair' | 'profond';

/** Ce que la carte porte autour du texte. L'emblème dit de quoi elle parle,
    en un coup d'œil et sans un mot. */
export type Deco = 'ballons' | 'confettis' | 'etoiles' | 'sceau';

export type ContenuDeCarte = {
  fond: Fond;
  deco: Deco;
  /** « Joyeux », « Merci », « Bienvenue dans ». */
  sur: string;
  /** Le grand mot, en italique et en dégradé cuivre. */
  grand: string;
  /** Sa taille : « d'avoir parlé de nous » ne tient pas au corps de
      « anniversaire ». Mesurée sur la maquette, pas devinée. */
  grandTaille: number;
  /** « Chère » ou « Cher ». */
  appel: string;
  prenom: string;
  phrase: string;
  /** `**` encadre ce qui se met en gras — le dessin le lit (`ds/carte.ts`). */
  corps: string;
  signe: string;
};

const F = { appel: 'Chère', venue: 'venue', entour: 'entourée' };
const H = { appel: 'Cher', venue: 'venu', entour: 'entouré' };
const accords = (g: Genre) => (g === 'homme' ? H : F);

/** Le prénom seul — c'est lui qu'on écrit sur une carte, jamais l'état civil.
    Un nom vide rend une chaîne vide : la carte le dira, plutôt que d'écrire
    « undefined » sur une image qu'on envoie à quelqu'un. */
export const prenomDe = (nom: string): string => (nom ?? '').trim().split(/\s+/)[0] ?? '';

/** LES CARTES, DANS L'ORDRE OÙ ELLES SE PROPOSENT. */
export const CARTES_DE_LA_MAISON: { cle: CleCarte; mot: string }[] = [
  { cle: 'anniversaire', mot: 'Anniversaire' },
  { cle: 'merci', mot: 'Merci' },
  { cle: 'cercle', mot: 'Le Cercle' },
];

/** LES MOTIFS DU MERCI. Un seul mot par motif : la barre se lit, elle ne se
    déchiffre pas. */
export const MOTIFS_DE_MERCI: { cle: CleMotif; mot: string; quand: string }[] = [
  { cle: 'venue', mot: 'D’être venue', quand: 'le soir d’un rituel honoré' },
  { cle: 'confiance', mot: 'De ta confiance', quand: 'quand la Maison veut' },
  { cle: 'parle', mot: 'D’avoir parlé de nous', quand: 'quelqu’un est venu de sa part' },
  { cle: 'etoiles', mot: 'Pour les cinq étoiles', quand: 'le jour où l’avis paraît' },
  { cle: 'annee', mot: 'Pour cette année', quand: 'en décembre, à toutes en une fois' },
];

export type DemandeDeCarte = {
  carte: CleCarte;
  motif?: CleMotif;
  genre: Genre;
  prenom: string;
};

/** CE QUE PORTE LA CARTE. Une seule fonction, pour que les six variantes ne
    puissent pas diverger. */
export function texteDeLaCarte(o: DemandeDeCarte): ContenuDeCarte {
  const g = accords(o.genre);
  const p = o.prenom.trim();
  const commun = { appel: g.appel, prenom: p, signe: 'Avec toute notre affection.' };

  if (o.carte === 'anniversaire') {
    return {
      ...commun,
      fond: 'clair', deco: 'ballons',
      sur: 'Joyeux',
      grand: 'anniversaire', grandTaille: 140,
      phrase: 'Que cette année te ressemble, douce et lumineuse.',
      corps: `Toute l’équipe de **L’atelier MND** te souhaite une belle journée, ${g.entour} `
        + 'de celles et ceux qui t’aiment. Que la santé, la joie et la lumière t’accompagnent '
        + 'tout au long de l’année.',
    };
  }

  if (o.carte === 'cercle') {
    return {
      ...commun,
      fond: 'profond', deco: 'sceau',
      sur: 'Bienvenue dans',
      grand: 'Le Cercle', grandTaille: 156,
      phrase: 'Trois venues, et la Maison te reconnaît.',
      corps: 'À partir d’aujourd’hui, la Maison compte tes venues et tes gestes. Ton compte '
        + '**Ma Couronne** les garde pour toi, et ce qui s’ouvre s’ouvrira de lui-même.',
      signe: 'Bienvenue parmi les nôtres.',
    };
  }

  const merci = { ...commun, fond: 'clair' as Fond, deco: 'confettis' as Deco, sur: 'Merci' };
  switch (o.motif ?? 'venue') {
    case 'confiance':
      return {
        ...merci,
        grand: 'de ta confiance', grandTaille: 118,
        phrase: 'Une couronne se construit à deux.',
        corps: 'Saison après saison, tu nous confies la tienne, et nous en sommes fiers. '
          + 'Toute l’équipe de **L’atelier MND** te remercie.',
      };
    case 'parle':
      return {
        ...merci,
        grand: 'd’avoir parlé de nous', grandTaille: 88,
        phrase: 'Quelqu’un est venu de ta part.',
        corps: 'C’est le plus beau des compliments, et nous ne l’oublions pas. '
          + 'Toute l’équipe de **L’atelier MND** te remercie.',
      };
    case 'etoiles':
      /* LA CARTE NE NOMME PAS GOOGLE : elle part à la cliente, pas à la
         plateforme, et elle reste juste le jour où l'avis vient d'ailleurs. */
      return {
        ...merci, deco: 'etoiles',
        grand: 'pour tes cinq étoiles', grandTaille: 88,
        phrase: 'Cinq étoiles, et quelques mots qui nous portent.',
        corps: 'Ce que tu as écrit se lit avant nous, par celles qui nous cherchent. C’est ce '
          + 'qui fait venir la suivante, et nous ne l’oublions pas. Toute l’équipe de '
          + '**L’atelier MND** te remercie.',
      };
    case 'annee':
      return {
        ...merci,
        grand: 'pour cette année', grandTaille: 116,
        phrase: 'Une année de plus à veiller sur ta couronne.',
        corps: 'Merci de nous l’avoir confiée. Que la prochaine te soit douce, et qu’elle nous '
          + 'retrouve à **L’atelier MND**.',
      };
    default:
      /* LE SEUL MOTIF DONT LE TITRE S'ACCORDE — c'est celui qui partira le plus
         souvent, il fallait qu'on ne puisse pas se tromper. */
      return {
        ...merci,
        grand: `d’être ${g.venue}`, grandTaille: 132,
        phrase: 'Ta couronne était entre nos mains aujourd’hui.',
        corps: 'C’est une confiance que nous ne prenons pas à la légère. Prends soin d’elle '
          + 'jusqu’à la prochaine fois, et **L’atelier MND** s’occupe du reste.',
      };
  }
}

/** LE MOT QUI ACCOMPAGNE L'IMAGE. Court : l'image dit le reste, et un message
    qui répète la carte se lit deux fois pour rien.

    IL EST SIGNÉ PAR LE CODE (`signeLeMessage`) — jamais écrit à la main : la
    devise s'écorche une fois sur vingt quand on la recopie. */
export function motDeLaCarte(o: DemandeDeCarte): string {
  const g = accords(o.genre);
  const p = o.prenom.trim() || 'Chère tête couronnée';
  const dit = (() => {
    if (o.carte === 'anniversaire') {
      return `Joyeux anniversaire, ${p} ! Toute l’équipe de L’atelier MND te souhaite une belle `
        + 'journée, et une année douce et lumineuse.';
    }
    if (o.carte === 'cercle') {
      return `${p}, tu entres dans Le Cercle. Trois venues, et la Maison te reconnaît. `
        + 'Bienvenue parmi les nôtres.';
    }
    switch (o.motif ?? 'venue') {
      case 'confiance':
        return `Merci pour ta confiance, ${p}. Saison après saison, tu nous confies ta couronne, `
          + 'et nous en sommes fiers.';
      case 'parle':
        return `Merci d’avoir parlé de nous, ${p}. Quelqu’un est venu de ta part, et c’est le `
          + 'plus beau des compliments.';
      case 'etoiles':
        return `Merci pour tes cinq étoiles, ${p}. Ce que tu as écrit se lit avant nous, par `
          + 'celles qui nous cherchent, et nous ne l’oublions pas.';
      case 'annee':
        return `Merci pour cette année, ${p}. Une année de plus à veiller sur ta couronne : que `
          + 'la prochaine te soit douce.';
      default:
        return `Merci d’être ${g.venue}, ${p}. Ta couronne était entre nos mains aujourd’hui, et `
          + 'c’est une confiance que nous ne prenons pas à la légère.';
    }
  })();
  return signeLeMessage(dit);
}

/** L'OBJET D'UN E-MAIL — court, et il dit de quoi il s'agit avant l'ouverture. */
export function objetDeLaCarte(o: DemandeDeCarte): string {
  if (o.carte === 'anniversaire') return `Joyeux anniversaire, ${o.prenom.trim()}`;
  if (o.carte === 'cercle') return 'Bienvenue dans Le Cercle';
  return 'Merci';
}

const sansAccent = (t: string): string =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '');

/** LE NOM DU FICHIER TÉLÉCHARGÉ. Sans accent ni apostrophe : ce fichier
    traverse Windows, WhatsApp et une boîte mail, et chacun en écorche un
    caractère différent. */
export function nomDuFichier(o: DemandeDeCarte): string {
  const quoi = o.carte === 'merci' ? `merci-${o.motif ?? 'venue'}` : o.carte;
  const qui = sansAccent(o.prenom.trim()).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${quoi}${qui ? `-${qui}` : ''}.png`;
}
