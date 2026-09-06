/* ══ LE CONTRAT DE PRESTATION — 6 septembre 2026 ═════════════════════

   « Je dois construire les contrats des prestataires MND » (Yéman).

   UN PRESTATAIRE N'EST PAS UN SALARIÉ, et tout le contrat tient à cette
   phrase. Il travaille pour son compte, il facture, il choisit ses moyens.
   Écrire l'inverse dans une clause, ou seulement le laisser entendre, ferait
   requalifier la relation en contrat de travail avec tout ce qui suit :
   cotisations, ancienneté, indemnités de rupture.

   TROIS PROTECTIONS, DEMANDÉES ENSEMBLE (arbitrage de Yéman) :
   · la clientèle de la Maison ne se démarche pas ;
   · les gestes de la Maison lui appartiennent ;
   · ce qu'on voit d'une tête ne sort pas du salon.

   La première est celle qui coûte le plus cher quand elle manque : un maître
   qui part avec quinze têtes vaut plus qu'une année de commission.

   CE N'EST PAS UN AVIS JURIDIQUE. À relire par quelqu'un qui connaît le droit
   béninois avant d'être présenté à un prestataire. */

import {
  dureeEnClair, entreLesParties, enFrancais, numerote, piedDuContrat, sommeLisible,
  type Contrat,
} from './contrats';

export const VERSION_PRESTATAIRE = 'v1 · 6 septembre 2026';

/** Comment il est payé. Repris tel quel du répertoire des Prestataires : deux
    vocabulaires pour une même notion finiraient par se répondre de travers. */
export type ModeDeRemuneration = 'prestation' | 'forfait' | 'pourcentage' | 'horaire';

export const MODE_DIT: Record<ModeDeRemuneration, (taux: string) => string> = {
  prestation: (t) => `à la prestation, ${t} par prestation exécutée`,
  forfait: (t) => `au forfait, ${t} pour la mission convenue`,
  pourcentage: (t) => `au pourcentage, ${t} du montant facturé à la cliente`,
  horaire: (t) => `au temps passé, ${t} par heure ou par journée selon ce qui est convenu`,
};

/** LE TERME DU NON-DÉMARCHAGE. Douze mois : assez pour protéger la Maison,
    assez court pour ne pas empêcher quelqu'un de vivre de son métier. Une
    clause qu'un juge trouve excessive tombe en entier, et ne protège plus
    rien du tout. */
export const MOIS_NON_DEMARCHAGE = 12;

export type ContratPrestataire = {
  nom: string;
  specialite?: string;
  mode: ModeDeRemuneration;
  /** Le taux, dans l'unité du mode. En pourcentage pour `pourcentage`, en XOF
      sinon. Absent = « à convenir mission par mission », et le contrat le dit
      plutôt que d'inventer un chiffre. */
  taux?: number;
  /** Jours de règlement après la mission ou la facture. */
  joursDeReglement: number;
  jourIso: string;
};

export const JOURS_DE_REGLEMENT = 7;

export function texteContratPrestataire(o: ContratPrestataire & {
  maison: string; raison?: string; ville?: string; version?: string;
}): Contrat {
  const taux = o.taux === undefined
    ? 'un montant convenu avant chaque mission'
    : (o.mode === 'pourcentage' ? `${o.taux} %` : sommeLisible(o.taux));

  return {
    titre: 'Contrat de prestation de services',
    sousTitre: o.specialite,
    entete: entreLesParties({
      maison: o.maison, raison: o.raison, ville: o.ville,
      autre: o.nom, qualiteAutre: 'le prestataire',
    }),
    articles: numerote([
      {
        titre: 'Objet',
        lignes: [
          `Le prestataire réalise pour la Maison des interventions relevant de ${o.specialite?.trim() || 'sa spécialité'}, `
          + 'au salon ou sur les lieux que la Maison lui indique.',
          'Chaque intervention fait l’objet d’une mission convenue à l’avance : sa nature, sa '
          + 'date, sa durée et son montant. Aucune mission n’est due de part ni d’autre tant '
          + 'qu’elle n’a pas été convenue.',
        ],
      },
      {
        /* L'ARTICLE LE PLUS IMPORTANT DU CONTRAT, et le plus court. Tout le
           reste en découle : sans indépendance, la relation se requalifie. */
        titre: 'Indépendance des parties',
        lignes: [
          'Le prestataire exerce en toute indépendance. Il n’est ni salarié, ni agent, ni '
          + 'représentant de la Maison, et le présent contrat ne crée aucun lien de subordination.',
          'Il organise son travail comme il l’entend, sous réserve des horaires convenus pour '
          + 'chaque mission et des règles d’hygiène et de sécurité du salon.',
          'Il déclare être en règle au regard de ses obligations sociales et fiscales, et fait '
          + 'son affaire personnelle de ses déclarations et de ses cotisations.',
          'Il fournit ses propres outils, sauf ceux que la Maison met expressément à sa '
          + 'disposition pour une mission donnée.',
        ],
      },
      {
        titre: 'Rémunération et règlement',
        lignes: [
          `Le prestataire est rémunéré ${MODE_DIT[o.mode](taux)}.`,
          `Le règlement intervient au plus tard ${o.joursDeReglement} jours après la mission, `
          + 'ou après réception de la facture lorsque le prestataire en émet une.',
          'Les montants s’entendent toutes charges du prestataire comprises. La Maison ne prend '
          + 'à sa charge aucun déplacement, matériel ni assurance non convenus par écrit.',
        ],
      },
      {
        titre: 'Ce que le prestataire s’engage à tenir',
        lignes: [
          'Exécuter ses missions avec le soin, la ponctualité et la tenue que la Maison attend '
          + 'de toute personne qui touche à une tête.',
          'Respecter les protocoles d’hygiène du salon : matériel désinfecté, mains propres, '
          + 'poste laissé net.',
          'Prévenir la Maison dès qu’il sait qu’il ne pourra pas honorer une mission, et non le '
          + 'jour même : une cliente déplacée pour rien ne revient pas toujours.',
          'Signaler immédiatement tout incident survenu sur une tête, même léger.',
        ],
      },
      {
        /* LA PROTECTION QUI COÛTE LE PLUS CHER QUAND ELLE MANQUE. */
        titre: 'Clientèle de la Maison',
        lignes: [
          'Les têtes reçues au salon sont la clientèle de la Maison. Le prestataire ne les '
          + 'démarche pas pour son compte, ni pour celui d’un tiers.',
          `Cet engagement vaut pendant toute la durée du contrat et ${dureeEnClair(MOIS_NON_DEMARCHAGE)} après sa fin.`,
          'Il ne s’agit pas d’une interdiction d’exercer : le prestataire garde sa propre '
          + 'clientèle, la développe librement, et une personne qui vient à lui d’elle-même sans '
          + 'avoir été sollicitée n’est pas concernée.',
          'Il ne prend pas les coordonnées des clientes de la Maison à d’autre fin que la mission '
          + 'en cours, et ne les conserve pas après elle.',
        ],
      },
      {
        titre: 'Les gestes et les noms de la Maison',
        lignes: [
          'Les protocoles de la Maison, leurs enchaînements, leurs noms et les documents qui les '
          + 'décrivent appartiennent à la Maison.',
          'Le prestataire les exécute dans le cadre de ses missions. Il ne les enseigne pas, ne '
          + 'les reproduit pas ailleurs sous ces noms, et n’en tire aucune méthode qu’il '
          + 'présenterait comme sienne.',
          'Ce qu’il savait faire avant d’entrer à la Maison lui reste acquis : cet article ne '
          + 'porte que sur ce qui est propre à la Maison.',
        ],
      },
      {
        titre: 'Discrétion',
        lignes: [
          'Ce que le prestataire apprend d’une tête au salon ne sort pas du salon : son état '
          + 'capillaire, ce qu’elle paie, ce qu’elle confie.',
          'Il en va de même des prix, des marges, des fournisseurs et des méthodes de gestion de '
          + 'la Maison.',
          'Cet engagement n’a pas de terme et survit à la fin du contrat.',
          'Il ne publie aucune photographie prise au salon sans l’accord écrit de la Maison, et '
          + 'sans que la personne photographiée y ait elle-même consenti.',
        ],
      },
      {
        titre: 'Responsabilité',
        lignes: [
          'Le prestataire répond des dommages qu’il cause dans l’exécution de ses missions, aux '
          + 'personnes comme aux biens.',
          'La Maison répond de ses propres locaux et du matériel qu’elle fournit.',
          'Chacun se garantit contre les risques de son activité.',
        ],
      },
      {
        titre: 'Durée et fin du contrat',
        lignes: [
          'Le contrat prend effet au jour de sa signature et se poursuit tant que des missions '
          + 'sont convenues. Il n’emporte aucune exclusivité ni aucun volume garanti.',
          'Chaque partie peut y mettre fin par simple écrit, sans avoir à se justifier, sous '
          + 'réserve d’honorer les missions déjà convenues.',
          'En cas de manquement grave, notamment aux règles d’hygiène ou à la discrétion, la fin '
          + 'est immédiate.',
          'Les articles sur la clientèle, les gestes de la Maison et la discrétion survivent à '
          + 'la fin du contrat.',
        ],
      },
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
      maison: o.maison, ville: o.ville, version: o.version ?? VERSION_PRESTATAIRE,
    }),
  };
}
