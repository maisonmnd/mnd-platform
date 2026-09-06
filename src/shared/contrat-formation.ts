/* ══ LE CONTRAT DE FORMATION — Académie MND, 6 septembre 2026 ════════

   « Je dois construire les contrats de formation à l'Académie MND » (Yéman).

   CE CONTRAT ENGAGE DEUX FOIS PLUS QU'IL N'Y PARAÎT. La Maison réserve une
   place, un formateur et des heures de fauteuil ; l'apprenante engage de
   l'argent, souvent le sien, souvent emprunté. Les deux méritent d'être écrits.

   DEUX ARBITRAGES DE YÉMAN, ET ILS SONT FERMES :
   · LA FORMATION EST DUE EN ENTIER, même en cas d'abandon. Je l'ai dit et je
     le redis ici pour qui relira : c'est la clause la plus difficile à
     défendre devant un juge, parce qu'elle fait supporter la totalité du
     risque à l'apprenante. Elle est écrite telle qu'elle a été décidée, avec
     sa raison (la place et le formateur sont réservés) et la faculté pour la
     Maison de consentir un arrangement — ce qu'elle fera sans doute, et ce que
     le contrat ne l'oblige pas à faire.
   · LA MÉTHODE PEUT S'ENSEIGNER, SOUS LICENCE. L'apprenante certifiée exerce
     librement ; elle peut former à son tour, mais en le disant et avec
     l'accord écrit de la Maison. Le registre des formatrices reste à bâtir.

   CE N'EST PAS UN AVIS JURIDIQUE. À relire par quelqu'un qui connaît le droit
   béninois avant d'être présenté à une apprenante. */

import {
  entreLesParties, enFrancais, numerote, piedDuContrat, sommeLisible,
  type Contrat,
} from './contrats';

export const VERSION_FORMATION = 'v1 · 6 septembre 2026';

/** Le délai pendant lequel une certifiée peut demander sa licence
    d'enseignement sans autre condition que d'être à jour de son règlement. */
export const MOIS_AVANT_LICENCE = 12;

export type ContratFormation = {
  /** L'apprenante. */
  apprenante: string;
  /** Le nom de la formation suivie. */
  formation: string;
  /** Ce qu'elle coûte, en XOF. */
  prixXof: number;
  /** En combien de fois elle se règle. 1 = comptant. */
  echeances: number;
  /** Le premier jour de formation, si connu. */
  debutIso?: string;
  /** Sa durée annoncée, en semaines. */
  semaines?: number;
  /** Qui signe quand ce n'est pas elle : un parent pour une mineure, un
      employeur qui finance. Le contrat le nomme et dit à quel titre. */
  pourQui?: string;
  qualiteSignataire?: string;
  jourIso: string;
};

export function texteContratFormation(o: ContratFormation & {
  maison: string; raison?: string; ville?: string; version?: string;
  /* LE DÉLAI DÉCIDÉ PAR LA MAISON (Paramètres · Les textes · Contrats). En
     paramètre, jamais lu ici : une apprenante qui a signé « douze mois »
     garde douze mois, même si la Maison en décide dix-huit ensuite. */
  moisAvantLicence?: number;
}): Contrat {
  const moisAvantLicence = o.moisAvantLicence ?? MOIS_AVANT_LICENCE;
  const parEcheance = o.echeances > 1 ? Math.ceil(o.prixXof / o.echeances) : o.prixXof;

  return {
    titre: 'Contrat de formation',
    sousTitre: o.formation,
    entete: entreLesParties({
      maison: o.maison, raison: o.raison, ville: o.ville,
      autre: o.pourQui ? `${o.pourQui}${o.qualiteSignataire ? `, ${o.qualiteSignataire}` : ''}` : o.apprenante,
      qualiteAutre: o.pourQui ? 'le signataire' : 'l’apprenante',
      pourQui: o.pourQui ? o.apprenante : undefined,
    }),
    articles: numerote([
      {
        titre: 'Objet de la formation',
        lignes: [
          `La Maison forme ${o.apprenante} au programme « ${o.formation} » de l’Académie MND.`,
          o.debutIso
            ? `La formation débute le ${enFrancais(o.debutIso)}${o.semaines ? ` et s’étend sur ${o.semaines} semaines` : ''}.`
            : 'Les dates de début et de fin sont communiquées à l’apprenante avant le premier module.',
          'Le programme comprend des modules théoriques, des gestes pratiques sur tête, et une '
          + 'évaluation devant jury.',
          'La Maison fournit les supports, le matériel de formation et les têtes d’exercice. '
          + 'L’apprenante fournit sa tenue et ses effets personnels.',
        ],
      },
      {
        titre: 'Ce que la Maison s’engage à donner',
        lignes: [
          'Une place réservée dans la promotion, un formateur, et les heures annoncées.',
          'Un suivi individuel : présence, gestes exécutés, évaluations de modules, tout est '
          + 'consigné et lui est accessible.',
          'Le passage devant un jury à l’issue du parcours, dans les conditions de l’article sur '
          + 'la certification.',
          'De prévenir sans délai en cas de report d’une séance, et de la remplacer.',
        ],
      },
      {
        titre: 'Ce que l’apprenante s’engage à tenir',
        lignes: [
          'Être présente et à l’heure. Les absences et les retards sont consignés et pèsent sur '
          + 'la présentation au jury.',
          'Respecter les règles d’hygiène, le matériel et les personnes, apprenantes comme '
          + 'clientes.',
          'Traiter avec discrétion ce qu’elle apprend d’une tête pendant sa formation : son état '
          + 'capillaire, ce qu’elle paie, ce qu’elle confie. Cet engagement n’a pas de terme.',
          'Ne publier aucune photographie prise à l’Académie sans l’accord écrit de la Maison, et '
          + 'sans que la personne photographiée y ait elle-même consenti.',
        ],
      },
      {
        titre: 'Prix et règlement',
        lignes: [
          `Le prix de la formation est de ${sommeLisible(o.prixXof)}.`,
          o.echeances > 1
            ? `Il se règle en ${o.echeances} versements de ${sommeLisible(parEcheance)}, `
              + 'selon l’échéancier remis à l’inscription.'
            : 'Il se règle comptant à l’inscription.',
          'Le prix couvre l’enseignement, les supports, le matériel de formation et le passage '
          + 'devant le jury. Il ne couvre ni le transport, ni l’hébergement, ni les repas.',
          'Un retard de règlement suspend la présentation au jury, jamais l’accès aux séances '
          + 'déjà payées.',
        ],
      },
      {
        /* L'ARTICLE DÉCIDÉ PAR LA MAISON, ÉCRIT TEL QUEL. Il fait supporter le
           risque à l'apprenante, et il faut donc qu'il dise POURQUOI : une
           clause dont la raison est écrite se défend, une clause nue se casse. */
        titre: 'Abandon et interruption',
        lignes: [
          'L’inscription engage l’apprenante sur la totalité de la formation. En cas d’abandon, '
          + 'pour quelque motif que ce soit, le prix reste dû en entier et les versements déjà '
          + 'faits restent acquis à la Maison.',
          'La raison en est que la Maison réserve pour l’apprenante une place, un formateur et '
          + 'des heures de fauteuil qu’elle ne peut plus donner à une autre une fois la '
          + 'promotion commencée.',
          'La Maison peut néanmoins consentir un arrangement, un report sur une promotion '
          + 'suivante ou une remise, notamment en cas de maladie, de grossesse ou de force '
          + 'majeure. Elle en décide au cas par cas et le confirme par écrit.',
          'Si c’est la Maison qui interrompt la formation de son fait, elle rembourse les '
          + 'modules non dispensés.',
        ],
      },
      {
        titre: 'Certification',
        lignes: [
          'La certification s’obtient devant un jury, sur la base des évaluations de modules, de '
          + 'la pratique et de l’assiduité.',
          'Elle n’est pas acquise du seul fait d’avoir payé et d’avoir été présente : c’est ce '
          + 'qui fait sa valeur.',
          'En cas d’ajournement, l’apprenante peut se représenter une fois devant le jury dans '
          + 'les trois mois, sans frais supplémentaires.',
          'Le certificat est délivré au nom de l’Académie MND et reste vérifiable auprès d’elle.',
        ],
      },
      {
        /* LA MÉTHODE : EXERCER LIBREMENT, ENSEIGNER SOUS LICENCE (arbitrage). */
        titre: 'La méthode de la Maison',
        lignes: [
          'L’apprenante certifiée exerce librement ce qu’elle a appris. Elle ouvre son salon, '
          + 'coiffe qui elle veut, et la Maison s’en réjouit : c’est l’objet même de l’Académie.',
          'Les protocoles de la Maison, leurs enchaînements, leurs noms et leurs supports '
          + 'restent la propriété de la Maison.',
          'Elle peut former à son tour à la méthode MND, sous licence : elle en fait la demande '
          + 'à la Maison, qui la lui accorde par écrit et l’inscrit à son registre des '
          + `formatrices. Une certifiée à jour de son règlement peut la demander dès ${moisAvantLicence} mois `
          + 'après sa certification.',
          'Sans cette licence, elle n’annonce ni formation, ni programme, ni certification au '
          + 'nom de la Maison, et n’en utilise ni le nom ni les marques.',
          'Ce qu’elle savait faire avant d’entrer à l’Académie lui reste acquis : cet article ne '
          + 'porte que sur ce qui est propre à la Maison.',
        ],
      },
      {
        titre: 'Image et travaux',
        lignes: [
          'La Maison peut photographier les travaux réalisés en formation à des fins '
          + 'pédagogiques et de présentation de l’Académie.',
          'L’image de l’apprenante elle-même, en revanche, ne paraît nulle part sans son '
          + 'autorisation écrite distincte, qui se demande et se signe à part.',
        ],
      },
      o.pourQui ? {
        titre: 'Le signataire',
        lignes: [
          `${o.pourQui} signe le présent contrat pour ${o.apprenante} et répond du règlement du prix.`,
          'Les engagements d’assiduité, de discrétion et de tenue restent ceux de l’apprenante '
          + 'elle-même, qui en prend connaissance.',
        ],
      } : null,
      {
        titre: 'Droit applicable',
        lignes: [
          'Le présent contrat est régi par le droit béninois.',
          'En cas de difficulté, les parties chercheront d’abord une solution amiable.',
          `Fait en deux exemplaires, un pour chaque partie, le ${enFrancais(o.jourIso)}.`,
        ],
      },
    ]),
    pied: piedDuContrat({
      maison: o.maison, ville: o.ville, version: o.version ?? VERSION_FORMATION,
    }),
  };
}
